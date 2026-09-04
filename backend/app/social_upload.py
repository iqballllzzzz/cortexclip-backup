"""Pengunggah ke YouTube & TikTok + penjadwal yang berjalan di server.

Penjadwal ini dijalankan lewat background.spawn() di startup (main.py), jadi
umurnya lepas dari request mana pun — pengguna boleh menutup halaman.

BERKAS VIDEO
Job memakai berkas yang SUDAH dirender (clips.rendered_url). Kalau belum ada,
job merender lebih dulu lewat render_clip_server — jadi pengguna tidak perlu
menekan "unduh" satu-satu sebelum menjadwalkan.
"""
from __future__ import annotations

import os
import tempfile
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

from .social_publish import _sb, kredensial_siap, token_valid

TICK_S = 60.0                # periksa job jatuh tempo tiap menit
MAKS_PERCOBAAN = 3


async def _unduh(url: str, dest: str) -> str:
    async with httpx.AsyncClient(timeout=600, follow_redirects=True) as c:
        async with c.stream("GET", url) as r:
            if r.status_code >= 300:
                raise RuntimeError(f"unduh video {r.status_code}")
            with open(dest, "wb") as f:
                async for chunk in r.aiter_bytes(1 << 20):
                    f.write(chunk)
    if os.path.getsize(dest) < 10_000:
        raise RuntimeError("berkas video terlalu kecil / kosong")
    return dest


async def unggah_youtube(token: str, path: str, title: str,
                         description: str) -> dict[str, Any]:
    """Resumable upload YouTube Data API v3 (satu potong; klip < 100 MB)."""
    ukuran = os.path.getsize(path)
    meta = {
        "snippet": {"title": title[:100], "description": description[:4900],
                    "categoryId": "22"},
        # 'public' = langsung tayang. Ini memang yang diminta ("auto publish").
        "status": {"privacyStatus": "public", "selfDeclaredMadeForKids": False},
    }
    async with httpx.AsyncClient(timeout=1200) as c:
        r = await c.post(
            "https://www.googleapis.com/upload/youtube/v3/videos",
            params={"uploadType": "resumable", "part": "snippet,status"},
            headers={"Authorization": f"Bearer {token}",
                     "Content-Type": "application/json; charset=UTF-8",
                     "X-Upload-Content-Length": str(ukuran),
                     "X-Upload-Content-Type": "video/mp4"},
            json=meta)
        if r.status_code >= 300:
            raise RuntimeError(f"YouTube init {r.status_code}: {r.text[:200]}")
        sesi = r.headers.get("location")
        if not sesi:
            raise RuntimeError("YouTube tidak mengembalikan URL upload")
        with open(path, "rb") as f:
            data = f.read()
        r2 = await c.put(sesi, content=data,
                         headers={"Content-Type": "video/mp4",
                                  "Content-Length": str(ukuran)})
        if r2.status_code >= 300:
            raise RuntimeError(f"YouTube upload {r2.status_code}: {r2.text[:200]}")
        vid = (r2.json() or {}).get("id")
    return {"id": vid, "url": f"https://youtube.com/shorts/{vid}" if vid else None}


async def unggah_tiktok(token: str, path: str, caption: str) -> dict[str, Any]:
    """Content Posting API v2 — FILE_UPLOAD, satu potong."""
    ukuran = os.path.getsize(path)
    async with httpx.AsyncClient(timeout=1200) as c:
        r = await c.post(
            "https://open.tiktokapis.com/v2/post/publish/video/init/",
            headers={"Authorization": f"Bearer {token}",
                     "Content-Type": "application/json; charset=UTF-8"},
            json={"post_info": {"title": caption[:2100],
                                "privacy_level": "PUBLIC_TO_EVERYONE",
                                "disable_comment": False},
                  "source_info": {"source": "FILE_UPLOAD",
                                  "video_size": ukuran,
                                  "chunk_size": ukuran,
                                  "total_chunk_count": 1}})
        if r.status_code >= 300:
            raise RuntimeError(f"TikTok init {r.status_code}: {r.text[:200]}")
        d = (r.json() or {}).get("data") or {}
        url = d.get("upload_url")
        pid = d.get("publish_id")
        if not url:
            raise RuntimeError(f"TikTok tanpa upload_url: {str(d)[:150]}")
        with open(path, "rb") as f:
            data = f.read()
        r2 = await c.put(url, content=data, headers={
            "Content-Type": "video/mp4",
            "Content-Length": str(ukuran),
            "Content-Range": f"bytes 0-{ukuran - 1}/{ukuran}"})
        if r2.status_code >= 300:
            raise RuntimeError(f"TikTok upload {r2.status_code}: {r2.text[:200]}")
    return {"id": pid, "url": None}   # TikTok tidak balikin URL publik langsung


async def _berkas_klip(job: dict[str, Any]) -> str:
    """Path lokal berkas video klip — render dulu kalau belum ada."""
    rows = await _sb("GET", f"clips?id=eq.{job['clip_id']}"
                            "&select=id,project_id,rendered_url,user_id")
    if not rows:
        raise RuntimeError("klip tidak ditemukan")
    clip = rows[0]
    url = clip.get("rendered_url")
    if not url:
        from .render_clip import render_clip_server
        hasil = await render_clip_server(
            str(clip["project_id"]), str(clip["id"]),
            os.getenv("SUPABASE_SERVICE_KEY", ""),
            resolution="720x1280", face_tracking=True)
        url = hasil.get("url")
        if not url:
            raise RuntimeError("render klip gagal — tidak ada URL hasil")
    dest = os.path.join(tempfile.mkdtemp(prefix="publish_"), "video.mp4")
    return await _unduh(str(url), dest)


async def jalankan_job(job: dict[str, Any]) -> None:
    """Satu job: siapkan berkas → unggah → catat hasil."""
    jid = job["id"]
    try:
        await _sb("PATCH", f"publish_jobs?id=eq.{jid}",
                  json={"status": "rendering",
                        "attempts": int(job.get("attempts") or 0) + 1})
        if not kredensial_siap(job["platform"]):
            raise RuntimeError(
                f"Integrasi {job['platform']} belum aktif di server "
                "(kredensial OAuth belum diatur admin)")

        rows = await _sb("GET", f"social_accounts?id=eq.{job['account_id']}"
                                "&select=id,platform,access_token,refresh_token,"
                                "expires_at,status")
        if not rows:
            raise RuntimeError("akun sosial tidak ditemukan")
        acc = rows[0]
        token = await token_valid(acc)

        path = await _berkas_klip(job)
        await _sb("PATCH", f"publish_jobs?id=eq.{jid}",
                  json={"status": "uploading"})

        if job["platform"] == "youtube":
            hasil = await unggah_youtube(token, path, job.get("title") or "Klip",
                                         job.get("description") or "")
        else:
            cap = f"{job.get('title') or ''} {job.get('hashtags') or ''}".strip()
            hasil = await unggah_tiktok(token, path, cap)

        await _sb("PATCH", f"publish_jobs?id=eq.{jid}", json={
            "status": "published", "remote_id": hasil.get("id"),
            "remote_url": hasil.get("url"),
            "published_at": datetime.now(timezone.utc).isoformat(),
            "error_message": None})
        print(f"[autopublish] job {str(jid)[:8]} → TAYANG di {job['platform']}")
        try:
            os.unlink(path)
        except Exception:
            pass
    except Exception as exc:
        pesan = f"{exc.__class__.__name__}: {exc}"[:400]
        percobaan = int(job.get("attempts") or 0) + 1
        # gagal sementara → biarkan 'scheduled' supaya dicoba lagi; gagal
        # permanen (kehabisan percobaan) → 'failed' supaya tidak terus mencoba
        st = "failed" if percobaan >= MAKS_PERCOBAAN else "scheduled"
        await _sb("PATCH", f"publish_jobs?id=eq.{jid}",
                  json={"status": st, "error_message": pesan})
        print(f"[autopublish] job {str(jid)[:8]} GAGAL ({st}): {pesan[:160]}")


async def loop_penjadwal() -> None:
    """Loop utama: ambil job jatuh tempo, jalankan satu per satu.

    Sengaja SERIAL: dua unggahan bersamaan ke platform yang sama memicu rate
    limit, dan render klip berat di CPU. Satu-satu lebih lambat tapi selesai.
    """
    import asyncio
    print("[autopublish] penjadwal jalan (tick 60s)")
    while True:
        try:
            # PENTING: waktu ISO memuat '+00:00'. Di query string, '+' dibaca
            # sebagai SPASI oleh PostgREST → error 22007 "invalid input syntax
            # for type timestamp". Jadi harus di-encode.
            from urllib.parse import quote
            sekarang = quote(datetime.now(timezone.utc).isoformat())
            jobs = await _sb("GET", "publish_jobs?status=eq.scheduled"
                                    f"&scheduled_at=lte.{sekarang}"
                                    "&select=id,user_id,account_id,clip_id,"
                                    "platform,title,description,hashtags,attempts"
                                    "&order=scheduled_at.asc&limit=5")
            for job in (jobs or []):
                await jalankan_job(job)
        except Exception as exc:
            print(f"[autopublish] tick error: {exc}")
        await asyncio.sleep(TICK_S)
