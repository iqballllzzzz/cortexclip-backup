"""Thumbnail klip — satu frame representatif dari video sumber.

Permintaan pengguna: kartu klip di halaman proyek harus menampilkan GAMBAR
potongan klip, bukan kotak polos dengan angka skor.

Cara kerja (murah, tidak mengunduh video penuh):
  1. Ambil URL sumber yang bisa di-seek (storage publik → HTTP Range 206).
  2. `ffmpeg -ss <t> -i url -frames:v 1` menarik hanya byte di sekitar posisi
     itu. Video 1 jam 900MB hanya perlu beberapa ratus KB.
  3. Frame di-crop ke 9:16 memakai jalur kamera face-tracking yang SUDAH ada
     (clips.camera_track.layout_frames) bila tersedia, jadi wajahnya masuk
     bingkai — bukan crop tengah yang sering mengenai ruang kosong.
  4. Upload JPG ke bucket video-uploads pada
     {user_id}/{project_id}/thumbs/{clip_id}.jpg, lalu simpan URL publik ke
     clips.thumb_url.

Waktu frame TIDAK di detik 0: hook 3 detik pertama sering masih transisi.
Diambil pada 28% durasi klip (dijepit 1.5s..akhir-1s) — cukup masuk ke isi
tanpa kena frame hitam/transisi.
"""

from __future__ import annotations

import os
import subprocess
import tempfile
from typing import Any

import httpx
from anyio import to_thread

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
PUBLIC_SUPABASE_URL = (os.environ.get("PUBLIC_SUPABASE_URL", "")
                       or SUPABASE_URL).rstrip("/")
BUCKET = "video-uploads"

# Bagian durasi klip tempat frame diambil. 0.28 = 28% masuk ke klip.
POSISI_FRAME = 0.28
LEBAR_THUMB = 405   # 405x720 = 9:16, cukup tajam untuk kartu ~200px
TINGGI_THUMB = 720


def _headers() -> dict[str, str]:
    return {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}


async def _row_klip(clip_id: str) -> dict[str, Any]:
    url = (f"{SUPABASE_URL}/rest/v1/clips?id=eq.{clip_id}"
           "&select=id,project_id,start_time,end_time,thumb_url,camera_track")
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(url, headers=_headers())
    if r.status_code != 200 or not r.json():
        raise RuntimeError("Klip tidak ditemukan")
    return r.json()[0]


async def _row_proyek(project_id: str) -> dict[str, Any]:
    url = (f"{SUPABASE_URL}/rest/v1/projects?id=eq.{project_id}"
           "&select=id,user_id,storage_path,source_url")
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get(url, headers=_headers())
    if r.status_code != 200 or not r.json():
        raise RuntimeError("Proyek tidak ditemukan")
    return r.json()[0]


def _crop_dari_track(track: Any, t_klip: float,
                     start_time: float) -> tuple[int, int, int, int] | None:
    """Kotak crop 9:16 di posisi kamera face-tracking pada waktu itu.

    `camera_track` disimpan render pipeline: {fps, src_w, src_h, layout_frames}
    dengan layout_frames[i] = x kiri crop pada frame i (lihat _cam_track_dari).
    Balik (w, h, x, y) untuk filter ffmpeg crop, atau None kalau data tidak
    memadai (frontend lalu memakai crop tengah).
    """
    if not isinstance(track, dict):
        return None
    src_w = track.get("src_w")
    src_h = track.get("src_h")
    frames = track.get("layout_frames") or track.get("x")
    fps = track.get("fps")
    if not (src_w and src_h and isinstance(frames, list) and frames and fps):
        return None
    try:
        idx = int(max(0.0, t_klip) * float(fps))
        idx = min(idx, len(frames) - 1)
        item = frames[idx]
        # layout_frames bisa berisi angka (x) atau dict {x: ...}
        x = item.get("x") if isinstance(item, dict) else item
        if x is None:
            return None
        h = int(src_h)
        w = int(round(h * 9 / 16))
        if w > int(src_w):
            w = int(src_w)
            h = int(round(w * 16 / 9))
        x = int(max(0, min(int(src_w) - w, int(float(x)))))
        y = int(max(0, (int(src_h) - h) // 2))
        # ffmpeg butuh dimensi genap
        return (w - (w % 2), h - (h % 2), x, y)
    except Exception:
        return None


def _ambil_frame(url: str, detik: float, dest: str,
                 crop: tuple[int, int, int, int] | None) -> None:
    """ffmpeg satu frame pada `detik` (HTTP range: hanya byte sekitar itu)."""
    vf = []
    if crop:
        w, h, x, y = crop
        vf.append(f"crop={w}:{h}:{x}:{y}")
    else:
        # crop tengah 9:16 dari sumber apa pun
        vf.append("crop='min(iw,ih*9/16)':'min(ih,iw*16/9)'")
    vf.append(f"scale={LEBAR_THUMB}:{TINGGI_THUMB}:flags=bicubic")
    cmd = [
        "ffmpeg", "-y", "-v", "error",
        "-reconnect", "1", "-reconnect_streamed", "1",
        "-reconnect_delay_max", "5", "-rw_timeout", "20000000",
        "-ss", f"{max(0.0, detik):.3f}", "-i", url,
        "-frames:v", "1", "-vf", ",".join(vf),
        "-q:v", "4", dest,
    ]
    subprocess.run(cmd, check=True, capture_output=True, timeout=120)


async def _unggah(local: str, path: str) -> str:
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{path}"
    with open(local, "rb") as f:
        data = f.read()
    headers = {**_headers(), "Content-Type": "image/jpeg", "x-upsert": "true"}
    async with httpx.AsyncClient(timeout=120) as c:
        r = await c.post(url, headers=headers, content=data)
    if r.status_code not in (200, 201):
        raise RuntimeError(f"Upload thumbnail gagal ({r.status_code})")
    return f"{PUBLIC_SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{path}"


async def _simpan_url(clip_id: str, thumb_url: str) -> None:
    url = f"{SUPABASE_URL}/rest/v1/clips?id=eq.{clip_id}"
    async with httpx.AsyncClient(timeout=30) as c:
        await c.patch(url, headers={**_headers(),
                                    "Content-Type": "application/json"},
                      json={"thumb_url": thumb_url})


async def pastikan_thumb(clip_id: str, user_id: str, *,
                         source_url_for, paksa: bool = False) -> dict[str, Any]:
    """Buat thumbnail bila belum ada. Idempoten dan murah.

    `source_url_for(project) -> url | None` disuntik dari render_clip supaya
    logika URL sumber (storage publik / range-able) tidak diduplikasi.
    """
    klip = await _row_klip(clip_id)
    if klip.get("thumb_url") and not paksa:
        return {"ok": True, "url": klip["thumb_url"], "cached": True}

    proyek = await _row_proyek(str(klip["project_id"]))
    if str(proyek.get("user_id")) != str(user_id):
        raise RuntimeError("Klip ini bukan milik akun kamu")

    url = await source_url_for(proyek)
    if not url:
        # sumber belum di storage → tidak ada jalur murah; jangan unduh 1GB
        # hanya untuk satu gambar. Frontend tetap menampilkan placeholder.
        return {"ok": False, "url": None, "reason": "sumber belum di storage"}

    start = float(klip.get("start_time") or 0.0)
    end = float(klip.get("end_time") or (start + 30.0))
    dur = max(1.0, end - start)
    t_klip = min(max(1.5, dur * POSISI_FRAME), max(1.0, dur - 1.0))
    detik_abs = start + t_klip
    crop = _crop_dari_track(klip.get("camera_track"), t_klip, start)

    tmp = tempfile.mktemp(suffix=".jpg")
    try:
        await to_thread.run_sync(lambda: _ambil_frame(url, detik_abs, tmp, crop))
        if not os.path.exists(tmp) or os.path.getsize(tmp) < 800:
            raise RuntimeError("frame kosong")
        path = f"{proyek['user_id']}/{klip['project_id']}/thumbs/{clip_id}.jpg"
        public = await _unggah(tmp, path)
        await _simpan_url(clip_id, public)
        kb = os.path.getsize(tmp) / 1024
        print(f"[thumb] {clip_id[:8]} t={detik_abs:.1f}s "
              f"crop={'track' if crop else 'tengah'} {kb:.0f}KB")
        return {"ok": True, "url": public, "cached": False}
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass
