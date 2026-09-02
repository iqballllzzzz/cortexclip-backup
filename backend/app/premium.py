"""Fitur server-side CortexClip:
- YouTube: download (yt-dlp) -> transkripsi server-side (Groq via hydra)
  -> 2-pass clip selection -> simpan project + clips (pipeline penuh di VPS).
- Share project: token 7 hari, view publik + accept (copy ke akun penerima).
- Quota free/premium: free 2 video/hari & 10 klip/video, premium 10 & 40.
- Premium via Pakasir: checkout QRIS + webhook + verifikasi transactiondetail.
"""

from __future__ import annotations

import os
import re
import json
import time
import uuid
import secrets
import asyncio
import tempfile
import subprocess
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx

SUPABASE_URL = os.environ.get("SUPABASE_URL", "http://localhost:8000")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
# PENTING: default WAJIB domain produksi (https). Dulu default-nya
# "http://38.47.93.148" → link share/QR yang dikirim ke user mengarah ke IP,
# lalu nginx 301 ke https://<IP> yang sertifikatnya cuma untuk
# clip.aqualibrya.my.id → browser user kena "connection not private".
PUBLIC_BASE = (os.environ.get("PUBLIC_BASE_URL") or "https://clip.aqualibrya.my.id").rstrip("/")

PAKASIR_PROJECT = os.environ.get("PAKASIR_PROJECT", "aqualibriaclip")
PAKASIR_API_KEY = os.environ.get("PAKASIR_API_KEY", "")
PAKASIR_BASE = "https://app.pakasir.com/api"

UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "/home/muhiqbalsukarno/cortexclip-backup/backend/uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ---- Plan & limit -----------------------------------------------------------
PLANS: dict[str, dict[str, Any]] = {
    "day":   {"label": "1 Hari",  "days": 1,   "amount": 3000},
    "5day":  {"label": "5 Hari",  "days": 5,   "amount": 8000},
    "month": {"label": "1 Bulan", "days": 30,  "amount": 25000},
    "year":  {"label": "1 Tahun", "days": 365, "amount": 210000},
}
FREE_LIMITS = {"projects_per_day": 2, "clips_per_video": 10}
PREMIUM_LIMITS = {"projects_per_day": 10, "clips_per_video": 40}

MSG_LIMIT_PROJECT = (
    "Limit harian tercapai: akun gratis hanya bisa membuat 2 video per hari "
    "(maks 10 klip per video). Upgrade ke Premium untuk 10 video/hari & 40 klip/video."
)

_service_headers = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}


async def sb(method: str, path: str, json_body=None, params=None) -> Any:
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.request(method, url, headers=_service_headers, json=json_body, params=params)
    if resp.status_code >= 300:
        raise RuntimeError(f"Supabase {path}: {resp.status_code} {resp.text[:200]}")
    if resp.status_code == 204 or not resp.text:
        return None
    return resp.json()


# ---- Plan / quota -----------------------------------------------------------
async def is_premium(user_id: str) -> bool:
    rows = await sb("GET", f"profiles?user_id=eq.{user_id}&select=premium_until")
    if not rows:
        return False
    pu = rows[0].get("premium_until")
    if not pu:
        return False
    try:
        return datetime.fromisoformat(pu.replace("Z", "+00:00")) > datetime.now(timezone.utc)
    except Exception:
        return False


async def limits_for(user_id: str) -> dict[str, Any]:
    prem = await is_premium(user_id)
    return {"plan": "premium" if prem else "free", **(PREMIUM_LIMITS if prem else FREE_LIMITS)}


async def projects_created_today(user_id: str) -> int:
    start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    rows = await sb("GET", f"projects?user_id=eq.{user_id}&created_at=gte.{start.strftime('%Y-%m-%dT%H:%M:%SZ')}&select=id")
    return len(rows or [])


async def quota_check_project(user_id: str) -> dict[str, Any]:
    lim = await limits_for(user_id)
    used = await projects_created_today(user_id)
    ok = used < lim["projects_per_day"]
    return {
        "ok": ok,
        "plan": lim["plan"],
        "used": used,
        "limit": lim["projects_per_day"],
        "clips_per_video": lim["clips_per_video"],
        "message": None if ok else MSG_LIMIT_PROJECT,
    }


async def grant_premium(user_id: str, plan_key: str) -> str:
    plan = PLANS[plan_key]
    rows = await sb("GET", f"profiles?user_id=eq.{user_id}&select=premium_until")
    base = datetime.now(timezone.utc)
    if rows and rows[0].get("premium_until"):
        try:
            cur = datetime.fromisoformat(rows[0]["premium_until"].replace("Z", "+00:00"))
            if cur > base:
                base = cur
        except Exception:
            pass
    until = (base + timedelta(days=plan["days"])).isoformat()
    # Tulis DUA kolom sekaligus. `premium_until` yang dipakai gating (is_premium),
    # tapi kolom `plan` dibaca view admin_user_overview + tipe frontend. Kalau
    # hanya premium_until yang ditulis (bug lama), user yang bayar lewat Pakasir
    # tetap tercatat plan='free' di DB → data drift vs admin.set_plan().
    await sb("PATCH", f"profiles?user_id=eq.{user_id}",
             json_body={"plan": "premium", "premium_until": until})
    return until


# ---- Pakasir ----------------------------------------------------------------
async def pakasir_create_qris(order_id: str, amount: int) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"{PAKASIR_BASE}/transactioncreate/qris",
            json={"project": PAKASIR_PROJECT, "order_id": order_id, "amount": amount, "api_key": PAKASIR_API_KEY},
        )
    if r.status_code >= 300:
        raise RuntimeError(f"Pakasir create: {r.status_code} {r.text[:200]}")
    return r.json().get("payment") or {}


async def pakasir_check(order_id: str, amount: int) -> Optional[str]:
    """Return status transaksi dari Pakasir, atau None kalau gagal dihubungi.

    Nilai yang benar-benar dipakai Pakasir (diverifikasi ke API produksi):
    'pending', 'completed', 'canceled'. TIDAK ADA status 'expired' — QRIS yang
    lewat waktu berubah menjadi 'canceled' (halaman bayar Pakasir sendiri
    menampilkan "Transaksi telah dibatalkan atau kadaluwarsa" untuk status itu).
    """
    if not PAKASIR_API_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(
                f"{PAKASIR_BASE}/transactiondetail",
                params={"project": PAKASIR_PROJECT, "amount": amount, "order_id": order_id, "api_key": PAKASIR_API_KEY},
            )
        if r.status_code >= 300:
            return None
        return (r.json().get("transaction") or {}).get("status")
    except Exception:
        return None


async def create_checkout(user_id: str, plan_key: str) -> dict[str, Any]:
    if plan_key not in PLANS:
        raise ValueError("Plan tidak dikenal")
    plan = PLANS[plan_key]
    order_id = f"CX-{uuid.uuid4().hex[:10].upper()}"
    pay = await pakasir_create_qris(order_id, plan["amount"])
    # `expired_at` hanya dikembalikan saat create (tidak ada di transactiondetail),
    # jadi WAJIB disimpan — tanpa ini countdown hilang saat user refresh.
    expired_at = str(pay.get("expired_at") or "")
    await sb("POST", "premium_orders", json_body=[{
        "user_id": user_id, "order_id": order_id, "plan": plan_key,
        "amount": plan["amount"], "status": "pending",
        "expired_at": expired_at or None,
    }])
    return {
        "order_id": order_id,
        "plan": plan_key,
        "label": plan["label"],
        "amount": plan["amount"],
        "total_payment": pay.get("total_payment") or plan["amount"],
        "qris": pay.get("payment_number") or "",
        "expired_at": expired_at,
        "qr_url": f"{PUBLIC_BASE}/api/premium/qr/{order_id}",
    }


async def handle_webhook(body: dict[str, Any]) -> dict[str, Any]:
    order_id = str(body.get("order_id") or "")
    amount = int(body.get("amount") or 0)
    status = str(body.get("status") or "")
    if not order_id:
        return {"ok": False, "reason": "order_id kosong"}
    rows = await sb("GET", f"premium_orders?order_id=eq.{order_id}&select=*")
    if not rows:
        return {"ok": False, "reason": "order tidak ditemukan"}
    order = rows[0]
    if int(order.get("amount") or 0) != amount:
        return {"ok": False, "reason": "amount mismatch"}
    if order.get("status") == "completed":
        return {"ok": True, "already": True}
    # KEAMANAN: jangan percaya body webhook — verifikasi selalu ke Pakasir
    verified = await pakasir_check(order_id, amount) or ""
    if verified != "completed":
        return {"ok": False, "reason": "belum terverifikasi di Pakasir", "pakasir_status": verified or None}
    until = await grant_premium(order["user_id"], order["plan"])
    await sb("PATCH", f"premium_orders?order_id=eq.{order_id}",
             json_body={"status": "completed", "payment_method": body.get("payment_method"),
                        "completed_at": datetime.now(timezone.utc).isoformat()})
    return {"ok": True, "premium_until": until}


# ---- YouTube pipeline -------------------------------------------------------
def _yt_extract_info(url: str) -> dict[str, Any]:
    import yt_dlp
    with yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True, "skip_download": True}) as ydl:
        info = ydl.extract_info(url, download=False)
    return {"title": (info.get("title") or "video-youtube")[:120], "duration": float(info.get("duration") or 0)}


def _yt_download(url: str, out_path: str) -> str:
    import yt_dlp
    opts = {
        "format": "bv*[height<=720]+ba/b[height<=720]/b",
        "outtmpl": out_path,
        "merge_output_format": "mp4",
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "concurrent_fragment_downloads": 4,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([url])
    return out_path


def _extract_audio_wav(src: str, dst: str) -> str:
    subprocess.run(
        ["ffmpeg", "-y", "-i", src, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", dst],
        check=True, capture_output=True, timeout=900,
    )
    return dst


def _wav_chunk_paths(wav_path: str, chunk_seconds: int = 600) -> list[str]:
    """Split WAV jadi potongan <25MB (Groq limit) — 600s @16kHz mono ≈ 19MB."""
    dur = float(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", wav_path],
        capture_output=True, text=True, check=True).stdout.strip() or 0)
    paths = []
    t = 0.0
    while t < dur:
        end = min(t + chunk_seconds, dur)
        p = f"{wav_path}.part{int(t)}.wav"
        subprocess.run(
            ["ffmpeg", "-y", "-ss", str(t), "-to", str(end), "-i", wav_path, "-c", "copy", p],
            check=True, capture_output=True, timeout=300,
        )
        paths.append(p)
        t = end
    return paths


def _probe_duration(path: str) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", path],
        capture_output=True, text=True, check=True).stdout.strip()
    return float(out or 0)


async def run_youtube_pipeline(project_id: str, user_id: str, url: str, target_count: int) -> None:
    """Background: download -> audio -> transcribe (chunked) -> detect -> save."""
    from .transcribe import transcribe_wav_chunk, transcript_with_words
    from .clip_selection import detect_clips
    from . import jobs as jobs_mod

    src_path = os.path.join(UPLOAD_DIR, f"{user_id}_{project_id}.mp4")
    wav_path = os.path.join(UPLOAD_DIR, f"{user_id}_{project_id}.wav")
    try:
        await jobs_mod.update_project(project_id, status="downloading")
        await asyncio.to_thread(_yt_download, url, src_path)

        await jobs_mod.update_project(project_id, status="transcribing")
        await asyncio.to_thread(_extract_audio_wav, src_path, wav_path)
        parts = await asyncio.to_thread(_wav_chunk_paths, wav_path)

        segments: list[dict[str, Any]] = []
        offset = 0.0
        for p in parts:
            chunk_dur = _probe_duration(p)
            try:
                segs = await transcribe_wav_chunk(open(p, "rb").read(), offset, chunk_dur)
                segments.extend(segs or [])
            except Exception as exc:
                print(f"[youtube] chunk transcribe gagal @ {offset}s: {exc}")
            finally:
                try:
                    os.unlink(p)
                except OSError:
                    pass
            offset += chunk_dur

        if not segments:
            raise RuntimeError("Transkripsi gagal / video tanpa ucapan.")
        segments.sort(key=lambda s: s["start"])
        duration = max(_probe_duration(src_path), max(s["end"] for s in segments))
        transcript = {"language": "id", "duration": round(duration, 2), "segments": transcript_with_words(segments)}
        await jobs_mod.update_project(project_id, transcript=transcript, duration_seconds=round(duration))

        await jobs_mod.update_project(project_id, status="analyzing")
        # GENRE video → dipakai memilih ikon/b-roll/emoji yang relate +
        # mempertajam judul/deskripsi/hashtag agar sesuai isi & genre.
        genre = ""
        try:
            from .genre import detect_genre
            from .transcribe import transcript_to_text
            g = await detect_genre(transcript_to_text(transcript))
            genre = str(g.get("genre") or "")
            print(f"[pipeline] genre terdeteksi: {genre} (sumber {g.get('source')})")
            await jobs_mod.update_project(project_id, genre=genre)
        except Exception as exc:
            print(f"[pipeline] deteksi genre gagal: {exc}")

        clips = await detect_clips(transcript, target_count, genre=genre)
        if not clips:
            raise RuntimeError("AI tidak menemukan klip yang layak dari video ini.")
        await jobs_mod.replace_clips(project_id, user_id, clips)
        await jobs_mod.update_project(project_id, status="completed")
    except Exception as exc:
        try:
            await jobs_mod.update_project(project_id, status="failed", error_message=str(exc)[:500])
        except Exception:
            pass
        print(f"[youtube] pipeline gagal: {exc}")
    finally:
        for p in (src_path, wav_path):
            try:
                if os.path.exists(p):
                    os.unlink(p)
            except OSError:
                pass


# ---- Share ------------------------------------------------------------------
async def create_share(user_id: str, project_id: str) -> dict[str, Any]:
    rows = await sb("GET", f"projects?id=eq.{project_id}&user_id=eq.{user_id}&select=id")
    if not rows:
        raise PermissionError("Proyek tidak ditemukan / bukan milikmu")
    token = secrets.token_urlsafe(16)
    expires = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    await sb("POST", "share_tokens", json_body=[{
        "token": token, "project_id": project_id, "owner_id": user_id, "expires_at": expires,
    }])
    return {"url": f"{PUBLIC_BASE}/share/{token}", "expires_at": expires}


async def get_order_status(user_id: str, order_id: str) -> dict[str, Any]:
    """Status order + premium_until; kalau masih pending, cek langsung ke Pakasir.

    Menandai KADALUARSA dengan dua cara (tanpa ini order mati menggantung
    'pending' selamanya):
      1. Pakasir menjawab 'canceled' — itulah status untuk QRIS yang lewat waktu
         (Pakasir tidak punya status 'expired').
      2. `expired_at` yang kita simpan sudah terlewat.
    """
    rows = await sb("GET", f"premium_orders?order_id=eq.{order_id}&user_id=eq.{user_id}"
                           "&select=order_id,plan,amount,status,payment_method,"
                           "created_at,completed_at,expired_at")
    if not rows:
        raise LookupError("Order tidak ditemukan")
    order = rows[0]
    if order["status"] == "pending":
        st = ""
        if PAKASIR_API_KEY:
            st = await pakasir_check(order_id, int(order["amount"])) or ""
        if st == "completed":
            await handle_webhook({"order_id": order_id, "amount": order["amount"],
                                  "status": "completed"})
            order["status"] = "completed"
        else:
            lewat_waktu = False
            exp = order.get("expired_at")
            if exp:
                try:
                    dt = datetime.fromisoformat(str(exp).replace("Z", "+00:00"))
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)
                    lewat_waktu = datetime.now(timezone.utc) >= dt
                except ValueError:
                    lewat_waktu = False
            if st == "canceled" or lewat_waktu:
                order["status"] = "expired"
                try:
                    await sb("PATCH", f"premium_orders?order_id=eq.{order_id}",
                             json_body={"status": "expired"})
                except Exception as exc:
                    print(f"[premium] tandai expired gagal: {exc}")
    prof = await sb("GET", f"profiles?user_id=eq.{user_id}&select=premium_until")
    return {"order": order, "premium_until": (prof or [{}])[0].get("premium_until")}


async def get_shared(token: str) -> dict[str, Any]:
    rows = await sb("GET", f"share_tokens?token=eq.{token}&select=*")
    if not rows:
        raise LookupError("Link tidak ditemukan")
    st = rows[0]
    if datetime.fromisoformat(st["expires_at"].replace("Z", "+00:00")) < datetime.now(timezone.utc):
        raise LookupError("Link sudah kadaluarsa")
    proj = await sb("GET", f"projects?id=eq.{st['project_id']}&select=id,title,source_type,duration_seconds,transcript,status,created_at")
    clips = await sb("GET", f"clips?project_id=eq.{st['project_id']}&select=id,title,description,hashtags,start_time,end_time,virality_score,hook_type,status&order=virality_score.desc")
    if not proj:
        raise LookupError("Proyek tidak ditemukan")
    return {"project": proj[0], "clips": clips or [], "expires_at": st["expires_at"], "owner_only_view": True}


async def accept_share(token: str, new_user_id: str) -> dict[str, Any]:
    data = await get_shared(token)
    src = data["project"]
    ins = await sb("POST", "projects", json_body=[{
        "user_id": new_user_id,
        "title": f"{src['title']} (dibagikan)",
        "source_type": src["source_type"],
        "source_url": None,
        "duration_seconds": src.get("duration_seconds"),
        "transcript": src.get("transcript"),
        "status": "completed" if (src.get("status") == "completed") else src.get("status") or "pending",
    }])
    new_id = ins[0]["id"]
    old_clips = await sb("GET", f"clips?project_id=eq.{src['id']}&select=*")
    if old_clips:
        rows = []
        for c in old_clips:
            c.pop("id", None)
            c["project_id"] = new_id
            c["user_id"] = new_user_id
            rows.append(c)
        await sb("POST", "clips", json_body=rows)
    return {"project_id": new_id, "title": f"{src['title']} (dibagikan)"}
