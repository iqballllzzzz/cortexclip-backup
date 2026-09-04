"""Metadata otomatis + penjadwalan + unggahan untuk auto-publish.

Dipisah dari social_publish.py (OAuth & token) supaya tiap berkas tetap
bisa dibaca. Modul ini yang dipanggil penjadwal.
"""
from __future__ import annotations

import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx

from .social_publish import (JAM_TAYANG_BAIK, JEDA_MIN_MENIT, _sb,
                             kredensial_siap, token_valid)

# Kata yang tidak layak jadi hashtag (kata sambung / kata umum bahasa Indonesia).
# Termasuk kata kerja & kata sifat umum yang sering muncul di transkrip tapi
# tidak berguna sebagai hashtag ("harus", "penting", "bagus"): hashtag harus
# menandai TOPIK, bukan menyalin kata yang sering diucapkan.
STOP = {
    "yang", "untuk", "dengan", "dari", "pada", "adalah", "akan", "sudah",
    "juga", "tidak", "bisa", "kalau", "karena", "atau", "saja", "ini", "itu",
    "aku", "kamu", "kita", "mereka", "dia", "saya", "anda", "nya", "gak",
    "ada", "jadi", "biar", "kayak", "banget", "udah", "terus", "tapi", "dan",
    "harus", "penting", "bagus", "sekali", "sangat", "lebih", "paling",
    "semua", "orang", "banyak", "sedikit", "kadang", "sering", "selalu",
    "pernah", "belum", "masih", "hanya", "cuma", "mungkin", "memang",
    "sebenarnya", "misalnya", "contohnya", "artinya", "maksudnya",
    "gimana", "bagaimana", "kenapa", "mengapa", "dimana", "kemana",
    "sekarang", "nanti", "besok", "kemarin", "dulu", "lagi", "sini", "situ",
    "the", "and", "for", "with", "that", "this", "you", "are", "was", "have",
    "just", "like", "very", "really", "about", "because", "there", "their",
    "what", "when", "which", "would", "could", "should",
}


def _kata_penting(words: list[dict[str, Any]], maks: int = 8) -> list[str]:
    """Kata paling sering (bukan stopword) — bahan hashtag."""
    hitung: dict[str, int] = {}
    for w in words:
        t = re.sub(r"[^\w]", "", str(w.get("word", w.get("text", "")))).lower()
        if len(t) < 4 or t in STOP or t.isdigit():
            continue
        hitung[t] = hitung.get(t, 0) + 1
    urut = sorted(hitung.items(), key=lambda kv: (-kv[1], kv[0]))
    return [k for k, _ in urut[:maks]]


def _kalimat_pertama(words: list[dict[str, Any]], maks_kata: int = 12) -> str:
    return " ".join(str(w.get("word", w.get("text", "")))
                    for w in words[:maks_kata]).strip()


def buat_metadata(clip: dict[str, Any], project: dict[str, Any],
                  platform: str) -> dict[str, str]:
    """Judul, deskripsi, hashtag — dari isi klip, bukan template kosong.

    Prioritas judul: judul klip dari AI (`clips.title`) → hook → kalimat
    pertama transkrip → judul proyek. Panjang dibatasi sesuai platform
    (YouTube 100 karakter, TikTok caption 2200 tapi praktisnya pendek).
    """
    words = clip.get("caption_words") or []
    if isinstance(words, str):
        try:
            import json
            words = json.loads(words)
        except Exception:
            words = []

    judul = (str(clip.get("title") or "").strip()
             or str(clip.get("hook") or "").strip()
             or _kalimat_pertama(words)
             or str(project.get("title") or "Klip baru").strip())
    judul = re.sub(r"\s+", " ", judul).strip(" -–—.,")
    batas = 100 if platform == "youtube" else 80
    if len(judul) > batas:
        judul = judul[:batas - 1].rsplit(" ", 1)[0] + "…"

    tags = _kata_penting(words, 8)
    hashtags = " ".join(f"#{t}" for t in tags[:6])
    umum = "#shorts #fyp #viral" if platform == "youtube" else "#fyp #foryou #viral"
    hashtags = (hashtags + " " + umum).strip()

    ringkas = _kalimat_pertama(words, 28)
    sumber = str(project.get("title") or "").strip()
    deskripsi = "\n\n".join(x for x in [
        ringkas,
        f"Dari: {sumber}" if sumber and sumber.lower() not in judul.lower() else "",
        hashtags,
        "Dibuat otomatis dengan CortexClip.",
    ] if x)
    if platform == "youtube" and len(deskripsi) > 4800:
        deskripsi = deskripsi[:4800]
    if platform == "tiktok":
        # TikTok: caption = judul + hashtag (deskripsi panjang tidak terpakai)
        deskripsi = f"{judul} {hashtags}".strip()[:2100]

    return {"title": judul, "description": deskripsi, "hashtags": hashtags}


def jadwal_otomatis(n: int, mulai: Optional[datetime] = None) -> list[datetime]:
    """Sebar n klip ke jam-jam ramai, minimal JEDA_MIN_MENIT antar unggahan.

    Kalau pengguna tidak memilih jam, ini yang dipakai. Tidak pernah
    menumpuk dua unggahan di menit yang sama (TikTok/YouTube membatasi laju,
    dan menumpuk juga terlihat spam).
    """
    now = mulai or datetime.now(timezone.utc)
    out: list[datetime] = []
    hari = 0
    while len(out) < n:
        for jam in JAM_TAYANG_BAIK:
            if len(out) >= n:
                break
            t = (now + timedelta(days=hari)).replace(
                hour=jam, minute=0, second=0, microsecond=0)
            if t <= now + timedelta(minutes=5):
                continue
            if out and (t - out[-1]) < timedelta(minutes=JEDA_MIN_MENIT):
                continue
            out.append(t)
        hari += 1
        if hari > 30:                      # jaring aman
            break
    return out


async def jadwalkan_klip(user_id: str, account_ids: list[str],
                         clip_ids: list[str],
                         jam_pilihan: Optional[list[int]] = None
                         ) -> dict[str, Any]:
    """Buat publish_jobs untuk kombinasi (akun × klip).

    jam_pilihan: daftar jam (0-23) yang dipilih pengguna. Kalau kosong →
    jadwal_otomatis().
    """
    if not account_ids or not clip_ids:
        raise ValueError("Pilih minimal satu akun dan satu klip")

    akun = await _sb("GET", "social_accounts?select=id,platform,status,user_id"
                            f"&user_id=eq.{user_id}&status=eq.connected")
    akun = [a for a in (akun or []) if a["id"] in set(account_ids)]
    if not akun:
        raise ValueError("Akun sosial media tidak ditemukan / belum tersambung")

    klip = await _sb("GET", "clips?select=id,project_id,title,hook,caption_words,"
                            f"user_id,start_time,end_time&user_id=eq.{user_id}")
    klip = [c for c in (klip or []) if c["id"] in set(clip_ids)]
    if not klip:
        raise ValueError("Klip tidak ditemukan")

    proyek_ids = sorted({str(c.get("project_id")) for c in klip if c.get("project_id")})
    proyek: dict[str, Any] = {}
    if proyek_ids:
        rows = await _sb("GET", "projects?select=id,title&id=in.("
                                + ",".join(proyek_ids) + ")")
        proyek = {str(r["id"]): r for r in (rows or [])}

    total = len(akun) * len(klip)
    if jam_pilihan:
        jadwal = _jadwal_dari_jam(total, sorted({int(j) % 24 for j in jam_pilihan}))
    else:
        jadwal = jadwal_otomatis(total)
    if len(jadwal) < total:
        raise RuntimeError("Tidak bisa menyusun jadwal untuk semua klip")

    baris: list[dict[str, Any]] = []
    i = 0
    for a in akun:
        for c in klip:
            meta = buat_metadata(c, proyek.get(str(c.get("project_id")), {}),
                                 a["platform"])
            baris.append({
                "user_id": user_id, "account_id": a["id"],
                "project_id": c.get("project_id"), "clip_id": c["id"],
                "platform": a["platform"],
                "title": meta["title"], "description": meta["description"],
                "hashtags": meta["hashtags"],
                "scheduled_at": jadwal[i].isoformat(), "status": "scheduled",
            })
            i += 1

    hasil = await _sb("POST", "publish_jobs", json=baris)
    return {"ok": True, "dibuat": len(hasil or []), "jobs": hasil or []}


def _jadwal_dari_jam(n: int, jam: list[int]) -> list[datetime]:
    """Sebar n unggahan HANYA pada jam-jam yang dipilih pengguna."""
    now = datetime.now(timezone.utc)
    out: list[datetime] = []
    hari = 0
    while len(out) < n and hari <= 60:
        for j in jam:
            if len(out) >= n:
                break
            t = (now + timedelta(days=hari)).replace(
                hour=j, minute=0, second=0, microsecond=0)
            if t <= now + timedelta(minutes=5):
                continue
            if out and (t - out[-1]) < timedelta(minutes=JEDA_MIN_MENIT):
                continue
            out.append(t)
        hari += 1
    return out


async def batalkan(user_id: str, job_id: str) -> dict[str, Any]:
    """Batal tayang. Hanya job yang BELUM tayang bisa dibatalkan."""
    rows = await _sb("GET", f"publish_jobs?id=eq.{job_id}&user_id=eq.{user_id}"
                            "&select=id,status")
    if not rows:
        raise ValueError("Job tidak ditemukan")
    st = rows[0].get("status")
    if st in ("published",):
        raise ValueError("Sudah tayang — tidak bisa dibatalkan dari sini")
    if st in ("uploading",):
        raise ValueError("Sedang diunggah — tunggu sampai selesai")
    await _sb("PATCH", f"publish_jobs?id=eq.{job_id}",
              json={"status": "canceled"})
    return {"ok": True}


async def daftar(user_id: str) -> dict[str, Any]:
    """Akun tersambung + job terjadwal (untuk halaman auto-publish)."""
    akun = await _sb("GET", "social_accounts?select=id,platform,profile_name,"
                            "account_name,avatar_url,status,login_method,"
                            "error_message,created_at"
                            f"&user_id=eq.{user_id}&order=created_at.desc")
    jobs = await _sb("GET", "publish_jobs?select=id,platform,title,scheduled_at,"
                            "status,remote_url,error_message,clip_id,project_id,"
                            "published_at"
                            f"&user_id=eq.{user_id}&order=scheduled_at.asc"
                            "&limit=200")
    return {"accounts": akun or [], "jobs": jobs or []}


async def putuskan(user_id: str, account_id: str) -> dict[str, Any]:
    """Lepas akun + batalkan job yang belum tayang dari akun itu."""
    rows = await _sb("GET", f"social_accounts?id=eq.{account_id}"
                            f"&user_id=eq.{user_id}&select=id")
    if not rows:
        raise ValueError("Akun tidak ditemukan")
    await _sb("PATCH", f"publish_jobs?account_id=eq.{account_id}"
                       "&status=in.(scheduled,failed)",
              json={"status": "canceled"})
    await _sb("DELETE", f"social_accounts?id=eq.{account_id}")
    return {"ok": True}
