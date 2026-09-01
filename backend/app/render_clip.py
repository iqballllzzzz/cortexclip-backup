"""Render a single clip server-side: download source from Supabase storage,
burn karaoke ASS + optional hook overlay, render vertical MP4, upload result
back to storage, update the clip row. Called from the frontend with the
user's Supabase JWT.
"""
from __future__ import annotations

import os
import json
import hashlib
import tempfile
import uuid
import time
from typing import Any, Optional

import httpx

from .subtitles import build_ass, build_srt, DEFAULT_STYLE, STYLE_PRESETS
from . import render as render_mod

SUPABASE_URL = os.environ.get("SUPABASE_URL", "http://localhost:8000")
SUPABASE_SERVICE_KEY_ENV = os.environ.get("SUPABASE_SERVICE_KEY", "")
# Public URL — supabase self-host diakses dari browser user (bukan localhost VPS)
PUBLIC_SUPABASE_URL = os.environ.get(
    "PUBLIC_SUPABASE_URL",
    "http://178.128.82.140:8000",
)
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
BUCKET = "video-uploads"


def _service_headers() -> dict[str, str]:
    return {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
    }


def _user_headers(token: str) -> dict[str, str]:
    return {
        "apikey": os.environ.get("SUPABASE_ANON_KEY", ""),
        "Authorization": f"Bearer {token}",
    }


async def download_from_storage(path: str, dest: str) -> str:
    """Download an object from Supabase storage to a local file."""
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{path}"
    async with httpx.AsyncClient(timeout=600) as client:
        resp = await client.get(url, headers=_service_headers())
    if resp.status_code != 200:
        raise RuntimeError(f"Storage download gagal ({resp.status_code})")
    with open(dest, "wb") as f:
        f.write(resp.content)
    return dest


async def upload_to_storage(local_path: str, storage_path: str) -> str:
    """Upload a local file to Supabase storage, returns public/signed path."""
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{storage_path}"
    with open(local_path, "rb") as f:
        data = f.read()
    headers = {
        **_service_headers(),
        "Content-Type": "application/octet-stream",
        "x-upsert": "true",
    }
    async with httpx.AsyncClient(timeout=600) as client:
        resp = await client.post(url, headers=headers, content=data)
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"Storage upload gagal ({resp.status_code}) {resp.text[:200]}")
    return storage_path


async def fetch_project_clip(project_id: str, clip_id: str, token: str) -> tuple[dict[str, Any], dict[str, Any]]:
    """Load project + clip rows via PostgREST using the user's token."""
    async with httpx.AsyncClient(timeout=30) as client:
        pr = await client.get(
            f"{SUPABASE_URL}/rest/v1/projects?id=eq.{project_id}&select=*",
            headers=_user_headers(token),
        )
        cr = await client.get(
            f"{SUPABASE_URL}/rest/v1/clips?id=eq.{clip_id}&select=*",
            headers=_user_headers(token),
        )
    if pr.status_code != 200 or cr.status_code != 200:
        raise RuntimeError("Gagal memuat project/clip")
    projects = pr.json()
    clips = cr.json()
    if not projects or not clips:
        raise RuntimeError("Project atau klip tidak ditemukan")
    return projects[0], clips[0]


async def render_clip_server(
    project_id: str,
    clip_id: str,
    token: str,
    caption_style: Optional[dict[str, Any]] = None,
    resolution: str = "720x1280",
    face_tracking: bool = True,
    hook_text: Optional[str] = None,
) -> dict[str, Any]:
    """Full server-side render of one clip. Returns {file, url, storage_path}."""
    project, clip = await fetch_project_clip(project_id, clip_id, token)

    workdir = tempfile.mkdtemp(prefix="cortexclip_render_")
    try:
        src = os.path.join(workdir, "source.mp4")
        await _ensure_source_local(project, src)

        words = (clip.get("caption_words") or [])
        if not isinstance(words, list) or not words:
            raise RuntimeError("Klip belum punya caption words")

        # style: cukup pass caption_style — build_ass resolve preset Supoclip.
        style = dict(caption_style or {})
        broll_enabled = bool(style.pop("broll", False))
        emoji_in_subtitle = bool(style.pop("emoji_extra", False))

        # dimensi output utk PlayRes + skala font (ala Supoclip)
        try:
            vw, vh = map(int, resolution.split("x"))
        except Exception:
            vw, vh = 1080, 1920

        # emoji pada subtitle: aktifkan emoji kontekstual ala Supoclip
        if emoji_in_subtitle:
            style.setdefault("emoji", True)

        ass = build_ass(words, style, video_width=vw, video_height=vh)
        ass_path = os.path.join(workdir, "subs.ass")
        with open(ass_path, "w", encoding="utf-8") as f:
            f.write(ass)

        # IKON & B-ROLL overlay (AI pilih momen → PNG Twemoji via ffmpeg overlay;
        # ASS emoji tidak andal → PNG 100% konsisten dengan preview browser)
        icon_ass_path: Optional[str] = None
        icon_png_overlays: list[dict[str, Any]] = []
        if broll_enabled:
            try:
                from .broll import compute_placements, ICON_EMOJI
                from .twemoji import twemoji_png
                duration = float(clip["end_time"]) - float(clip["start_time"])
                placements = await compute_placements(words, duration)
                if placements:
                    # posisi overlay PNG dalam koordinat OUTPUT (w,h)
                    for p in placements:
                        emoji = ICON_EMOJI.get(str(p.get("icon") or ""), "✨")
                        png = twemoji_png(emoji)
                        if not png:
                            continue
                        ts = float(p.get("time_start", 0))
                        te = max(ts + 0.5, float(p.get("time_end", ts + 2.5)))
                        side = str(p.get("side", "right"))
                        px = int(vw * (0.26 if side == "left" else 0.74 if side == "right" else 0.5))
                        py = int(vh * 0.30)
                        icon_png_overlays.append({
                            "png": png, "x": px - int(vw * 0.10), "y": py,
                            "size": int(vw * 0.20),
                            "t_start": ts, "t_end": te,
                        })
            except Exception as exc:
                print(f"[render] broll overlay gagal (render tetap jalan): {exc}")
                icon_png_overlays = []

        start = float(clip["start_time"])
        end = float(clip["end_time"])
        out_name = f"{uuid.uuid4().hex[:10]}.mp4"
        out_path = os.path.join(workdir, out_name)

        traj = None
        if face_tracking:
            try:
                traj = render_mod.analyze_face_track(src, start, end)
            except Exception:
                traj = None

        # Watermark: ON kecuali user sudah menuntaskan 4 iklan (profiles.ads_watched>=4)
        watermark_on = True
        try:
            user_id = clip.get("user_id") or project.get("user_id")
            async with httpx.AsyncClient(timeout=10) as c:
                pr = await c.get(
                    f"{SUPABASE_URL}/rest/v1/profiles?user_id=eq.{user_id}&select=ads_watched,watermark_removed",
                    headers={"apikey": SUPABASE_SERVICE_KEY_ENV,
                             "Authorization": f"Bearer {SUPABASE_SERVICE_KEY_ENV}"},
                )
                rows = pr.json() if pr.status_code == 200 else []
                if rows and (rows[0].get("watermark_removed") or int(rows[0].get("ads_watched") or 0) >= 4):
                    watermark_on = False
        except Exception:
            pass

        render_mod.render_clip(
            src, start, end, ass_path, out_path,
            resolution=resolution,
            face_tracking=bool(traj),
            camera_trajectory=traj,
            watermark=watermark_on,
            icon_ass_path=icon_ass_path,
        )

        # optional hook overlay burn
        if hook_text and hook_text.strip():
            hooked = os.path.join(workdir, "hooked.mp4")
            render_mod.burn_hook_overlay(out_path, hook_text.strip(), hooked)
            out_path = hooked

        user_id = clip.get("user_id") or project.get("user_id")
        storage_key = f"{user_id}/rendered/{clip_id}.mp4"
        await upload_to_storage(out_path, storage_key)

        # update clip row: status + rendered url (pakai URL publik, bukan localhost)
        rendered_url = f"{PUBLIC_SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{storage_key}"
        async with httpx.AsyncClient(timeout=30) as client:
            await client.patch(
                f"{SUPABASE_URL}/rest/v1/clips?id=eq.{clip_id}",
                headers=_user_headers(token),
                json={"status": "rendered", "rendered_url": rendered_url},
            )

        return {
            "file": out_name,
            "storage_path": storage_key,
            "url": rendered_url,
        }
    finally:
        import shutil
        shutil.rmtree(workdir, ignore_errors=True)


async def _ensure_source_local(project: dict[str, Any], dest: str) -> str:
    """Sediakan file sumber di `dest`.

    Prioritas: storage (kalau project.storage_path ada) → unduh ulang dari
    source_url (YouTube) sebagai jaring aman untuk project lama yang dibuat
    sebelum sumber ikut disimpan ke storage.
    """
    storage_path = project.get("storage_path")
    if storage_path:
        return await download_from_storage(storage_path, dest)

    url = project.get("source_url")
    if not url:
        raise RuntimeError(
            "Project ini tidak punya file sumber di server. Proses ulang project "
            "supaya video sumber tersimpan, lalu coba preview lagi."
        )
    from .youtube import hydra_download, _persist_source_to_storage

    await hydra_download(url, dest)
    # simpan sekalian supaya preview berikutnya instan
    try:
        await _persist_source_to_storage(project["id"], project["user_id"], dest)
    except Exception as exc:
        print(f"[preview] persist ulang gagal (lanjut): {exc}")
    return dest


async def render_preview_clip(
    project_id: str,
    clip_id: str,
    token: str,
    caption_style: Optional[dict[str, Any]] = None,
    resolution: str = "360x640",
    max_seconds: float = 3600.0,  # preview = durasi klip PENUH (bukan 12s)
) -> dict[str, Any]:
    """Render preview klip dengan pipeline ASLI (ASS burn + face tracking) resolusi rendah.

    Preview == hasil unduhan (font sama, animasi karaoke sama, framing sama) karena
    memakai build_ass + render_clip yang identik dengan render final — hanya resolusi
    lebih kecil (360x640) dan durasi di-cap agar cepat. Browser memutar file kecil
    ini, bukan streaming video sumber 43MB → instan, tanpa lag.
    """
    project, clip = await fetch_project_clip(project_id, clip_id, token)

    # Preview = video MURNI (tanpa subtitle burn) + face tracking.
    # Subtitle ditangani LIVE OVERLAY HTML5 di browser (instan ikut setting).
    # Satu render per klip — TIDAK perlu re-render tiap ganti gaya/ukuran/posisi.
    # Hash hanya dari klip (bukan style) supaya cache selalu hit.
    style = dict(caption_style or {})
    # hash SENGJAHA TIDAK termasuk resolusi: 180p & 360p share cache yang sama
    style_hash = hashlib.md5(
        json.dumps({"clip": clip_id, "v": 2}, sort_keys=True).encode()
    ).hexdigest()[:10]

    if clip.get("preview_style_hash") == style_hash and clip.get("preview_ready"):
        # cache hit — preview video murni sudah ada (subtitle via live overlay)
        return {
            "file": f"{clip_id}.mp4",
            "storage_path": f"{clip.get('user_id')}/previews/{clip_id}.mp4",
            "url": clip["preview_url"],
            "cached": True,
        }

    workdir = tempfile.mkdtemp(prefix="cortexclip_preview_")
    try:
        src = os.path.join(workdir, "source.mp4")
        await _ensure_source_local(project, src)

        start = float(clip["start_time"])
        end = min(float(clip["end_time"]), start + max_seconds)
        out_name = f"{uuid.uuid4().hex[:10]}.mp4"
        out_path = os.path.join(workdir, out_name)

        # FACE TRACKING CEPAT: analisis di-skip untuk preview — crop tengah saja.
        # (Analisis mediapipe per-frame = penyebab utama preview 1-2 menit;
        #  hasil render final tetap pakai tracking penuh, preview tidak.)
        # Jalur KILAT dulu (±3-8 detik); kalau gagal → jalur lama sebagai cadangan.
        try:
            render_mod.render_preview_fast(src, start, end, out_path)
        except Exception as exc:
            print(f"[preview] fast path gagal ({exc}) → fallback render_clip")
            render_mod.render_clip(
                src, start, end, None, out_path,
                resolution=resolution,
                face_tracking=False,
                camera_trajectory=None,
                watermark=False,
            )

        user_id = clip.get("user_id") or project.get("user_id")
        storage_key = f"{user_id}/previews/{clip_id}.mp4"
        await upload_to_storage(out_path, storage_key)
        # query param v=style_hash → browser cache-bust versi preview
        preview_url = (
            f"{PUBLIC_SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{storage_key}"
            f"?v={style_hash}"
        )

        async with httpx.AsyncClient(timeout=30) as client:
            await client.patch(
                f"{SUPABASE_URL}/rest/v1/clips?id=eq.{clip_id}",
                headers=_user_headers(token),
                json={
                    "preview_url": preview_url,
                    "preview_ready": True,
                    "preview_style_hash": style_hash,
                },
            )

        return {
            "file": out_name,
            "storage_path": storage_key,
            "url": preview_url,
        }
    finally:
        import shutil
        shutil.rmtree(workdir, ignore_errors=True)
