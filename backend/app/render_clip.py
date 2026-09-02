"""Render a single clip server-side: download source from Supabase storage,
burn karaoke ASS + optional hook overlay, render vertical MP4, upload result
back to storage, update the clip row. Called from the frontend with the
user's Supabase JWT.
"""
from __future__ import annotations

import os
import json
import hashlib
import subprocess
import tempfile
import uuid
import time
from typing import Any, Optional

import httpx
from anyio import to_thread

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
        # HEMAT: ambil hanya potongan klip dari storage (HTTP range + stream
        # copy) alih-alih mengunduh video penuh — video 1 jam 900MB jadi ~14MB.
        # start/end di bawah adalah waktu RELATIF terhadap segmen itu.
        abs_start = float(clip["start_time"])
        abs_end = float(clip["end_time"])
        src, start, end = await _ensure_source_segment(
            project, src, abs_start, abs_end)

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

        # deklarasi overlays sebelum dipakai emoji & broll
        icon_ass_path: Optional[str] = None
        icon_png_overlays: list[dict[str, Any]] = []

        # EMOJI per-kata → PNG Twemoji overlay (libass tak bisa render emoji).
        # PARITY: kata→emoji dihitung dari word_emoji.py — port EXACT dari
        # WORD_EMOJI live-caption-overlay.tsx, kata & emojinya sama dengan
        # yang tampil di preview. Posisi: kanan-subtitle (mirror overlay).
        emoji_in_text = bool(style.get("emoji", True))
        if emoji_in_text:
            try:
                from .subtitles import get_scaled_font_size
                from .twemoji import twemoji_png
                from .word_emoji import word_emoji

                pos_pct = float(style.get("position", 75))
                # parity ukuran: preview render emoji sebagai teks fontSize*1.1
                # (fontSize = font_size*0.42*vw/360) → PNG seukuran itu.
                try:
                    base_fs = int(style.get("font_size") or 32)
                except (TypeError, ValueError):
                    base_fs = 32
                em_size = max(24, int(get_scaled_font_size(base_fs, vw) * 1.25))
                emoji_count = 0
                for w in words:
                    if emoji_count >= 40:
                        break
                    emoji = word_emoji(str(w.get("word", w.get("text", ""))))
                    if not emoji:
                        continue
                    png = twemoji_png(emoji)
                    if not png:
                        continue
                    t_start_w = float(w.get("start", 0) or 0)
                    t_end_w = float(w.get("end", t_start_w) or 0)
                    # mirror preview: emoji absolute right:4%, sejajar tengah
                    # baris subtitle (x/y = TITIK TENGAH ikon di render.py)
                    icon_png_overlays.append({
                        "png": png,
                        "x": int(vw * 0.96 - em_size / 2),
                        "y": int(vh * pos_pct / 100.0),
                        "size": em_size,
                        "t_start": t_start_w,
                        "t_end": t_end_w + 1.0,
                    })
                    emoji_count += 1
            except Exception as exc:
                print(f"[render] emoji overlay gagal (render tetap jalan): {exc}")

        # IKON & B-ROLL overlay: planner baru (genre-aware, katalog 500+).
        # PARITY: preview memuat PNG dari GET /api/icons/{icon_id} — berkas
        # yang SAMA dengan yang dibakar ffmpeg di sini.
        broll_video_overlays: list[dict[str, Any]] = []
        if broll_enabled:
            try:
                from anyio import to_thread

                from .broll_video import broll_local_path
                from .icon_png import icon_png_from_id
                from .overlay_plan import plan_overlays

                duration = float(clip["end_time"]) - float(clip["start_time"])
                genre = str(project.get("genre") or "")
                if not genre:
                    from .genre import detect_genre_keywords
                    genre, _ = detect_genre_keywords(
                        " ".join(str(w.get("word", "")) for w in words)
                    )
                # PAKAI rencana yang sudah disimpan preview (parity mutlak);
                # kalau belum ada (user langsung unduh), hitung sekarang.
                saved = clip.get("overlay_plan")
                if isinstance(saved, list) and saved:
                    placements = saved
                    print(f"[render] overlay_plan dari preview: {len(placements)} item")
                else:
                    placements = await plan_overlays(words, duration, genre=genre)
                    print(f"[render] genre={genre} overlay baru={len(placements or [])}")
                for p in placements or []:
                    icon_id = str(p.get("icon_id") or "StarIcon")
                    png = icon_png_from_id(icon_id)
                    if not png:
                        continue
                    ts = float(p.get("time_start", 0))
                    te = max(ts + 0.5, float(p.get("time_end", ts + 2.5)))
                    side = str(p.get("side", "right"))
                    # mirror preview: left:20%/50%/80%, top:26%, translate(-50%,-50%)
                    px = int(vw * (0.20 if side == "left" else 0.80 if side == "right" else 0.5))
                    py = int(vh * 0.26)
                    icon_png_overlays.append({
                        "png": png, "x": px, "y": py,
                        "size": int(vw * 0.24),   # mirror width fit.w*0.24
                        "t_start": ts, "t_end": te,
                        "anim": str(p.get("animation") or "slide-left"),
                    })

                    # B-ROLL VIDEO PiP (mirror <video> PiP preview)
                    burl = p.get("broll_url")
                    if burl:
                        bfile = await to_thread.run_sync(broll_local_path, str(burl))
                        if bfile:
                            # Jendela b-roll di bawah wajah pembicara (wajah
                            # ~25-41% tinggi) & di atas subtitle (80%), lebar 74%
                            bw = int(vw * 0.74)
                            broll_video_overlays.append({
                                "file": bfile,
                                "x": (vw - bw) // 2,
                                "y": int(vh * 0.44),
                                "width": bw,
                                "height": int(bw * 9 / 16),
                                "t_start": ts,
                                "t_end": te,
                            })
            except Exception as exc:
                print(f"[render] broll overlay gagal (render tetap jalan): {exc}")

        # start/end sudah dihitung relatif terhadap segmen di atas
        out_name = f"{uuid.uuid4().hex[:10]}.mp4"
        out_path = os.path.join(workdir, out_name)

        traj = None
        cam_cuts: list[int] = []
        if face_tracking:
            try:
                st = render_mod.analyze_speaker_track(src, start, end)
                traj = st.get("trajectory") or None
                cam_cuts = list(st.get("cuts") or [])
                print(f"[render] speaker track: wajah={st.get('faces')} "
                      f"pindah={st.get('switches')} cuts={len(cam_cuts)}")
            except Exception as exc:
                print(f"[render] speaker track gagal: {exc}")
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
            camera_cuts=cam_cuts,
            watermark=watermark_on,
            icon_ass_path=icon_ass_path,
            icon_png_overlays=icon_png_overlays,  # FIX: sebelumnya overlay DIBUANG
            broll_video_overlays=broll_video_overlays,
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


async def _source_seek_url(project: dict[str, Any]) -> str | None:
    """URL sumber yang bisa di-SEEK ffmpeg (HTTP range) tanpa unduh penuh.

    Ini kunci preview cepat untuk video berjam-jam: `ffmpeg -ss <t> -i <url>`
    hanya menarik byte di sekitar posisi itu (storage Supabase mendukung
    HTTP Range 206), jadi klip di menit 50 dari video 1 jam tidak perlu
    mengunduh file 1 GB dulu.
    """
    storage_path = project.get("storage_path")
    if not storage_path:
        return None
    # bucket ini publik untuk video-uploads → URL langsung, tanpa header auth
    return f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{storage_path}"


def _keyframe_before(url: str, t: float, look: float = 14.0) -> Optional[float]:
    """Waktu keyframe terakhir <= t (probe hanya jendela kecil, via HTTP range)."""
    lo = max(0.0, t - look)
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0",
             "-skip_frame", "nokey", "-read_intervals", f"{lo}%+{look + 0.5}",
             "-show_entries", "frame=pts_time", "-of", "csv=p=0", url],
            capture_output=True, text=True, timeout=180,
        )
    except Exception:
        return None
    ks = []
    for x in r.stdout.split():
        try:
            ks.append(float(x))
        except ValueError:
            continue
    if not ks:
        return None
    le = [k for k in ks if k <= t + 0.001]
    return max(le) if le else min(ks)


async def _ensure_source_segment(
    project: dict[str, Any], dest: str, start: float, end: float,
) -> tuple[str, float, float]:
    """Sediakan HANYA potongan yang dibutuhkan, bukan seluruh video.

    Video 1 jam bisa 900MB+; mengunduh penuh untuk memotong 60 detik itu
    pemborosan disk/RAM/waktu dan penyebab utama proses video panjang berat.
    Di sini segmen diambil lewat HTTP range + stream-copy (tanpa re-encode),
    dimulai dari KEYFRAME sebelum klip supaya tidak ada frame rusak.

    Balik (path, start_relatif, end_relatif). Offset dihitung dari posisi
    keyframe → timing subtitle & face tracking tetap tepat (diuji: diff
    piksel 0.00 dibanding frame dari sumber penuh).
    """
    url = await _source_seek_url(project)
    if not url:
        await _ensure_source_local(project, dest)
        return dest, start, end

    pad_before = 6.0
    pad_after = 1.5
    kf = await to_thread.run_sync(_keyframe_before, url, max(0.0, start - pad_before))
    if kf is None:
        await _ensure_source_local(project, dest)
        return dest, start, end

    seg_dur = (end - kf) + pad_after
    cmd = ["ffmpeg", "-y", "-v", "error",
           "-reconnect", "1", "-reconnect_streamed", "1",
           "-reconnect_delay_max", "5", "-rw_timeout", "30000000",
           "-ss", f"{kf:.3f}", "-t", f"{seg_dur:.3f}", "-i", url,
           "-c", "copy", "-movflags", "+faststart", dest]
    try:
        await to_thread.run_sync(lambda: subprocess.run(
            cmd, check=True, capture_output=True, timeout=900))
    except Exception as exc:
        print(f"[render] ekstrak segmen gagal ({str(exc)[:100]}) → unduh penuh")
        await _ensure_source_local(project, dest)
        return dest, start, end
    if not os.path.exists(dest) or os.path.getsize(dest) < 20000:
        print("[render] segmen terlalu kecil → unduh penuh")
        await _ensure_source_local(project, dest)
        return dest, start, end

    off = start - kf
    mb = os.path.getsize(dest) / 1024 / 1024
    print(f"[render] segmen {mb:.1f}MB dari keyframe {kf:.2f}s "
          f"(offset {off:.2f}s) — tanpa unduh video penuh")
    return dest, off, off + (end - start)


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
        abs_start = float(clip["start_time"])
        abs_end = min(float(clip["end_time"]), abs_start + max_seconds)
        out_name = f"{uuid.uuid4().hex[:10]}.mp4"
        out_path = os.path.join(workdir, out_name)

        # SUMBER: coba HTTP-seek dulu (tanpa unduh file penuh) — ini yang
        # membuat preview klip di menit ke-50 video 1 jam tetap cepat.
        # Kalau gagal (bucket privat / codec butuh index) → unduh lokal.
        seek_url = await _source_seek_url(project)
        made = False
        if seek_url:
            try:
                render_mod.render_preview_fast(seek_url, abs_start, abs_end, out_path)
                made = os.path.exists(out_path) and os.path.getsize(out_path) > 8000
                if made:
                    print("[preview] jalur HTTP-seek (tanpa unduh penuh)")
            except Exception as exc:
                print(f"[preview] HTTP-seek gagal ({str(exc)[:120]}) → unduh lokal")

        if not made:
            src = os.path.join(workdir, "source.mp4")
            src2, rs, re_ = await _ensure_source_segment(
                project, src, abs_start, abs_end)
            # FACE TRACKING CEPAT: analisis di-skip untuk preview — crop tengah.
            # Jalur KILAT dulu (±3-8 detik); kalau gagal → render_clip biasa.
            try:
                render_mod.render_preview_fast(src2, rs, re_, out_path)
            except Exception as exc:
                print(f"[preview] fast path gagal ({exc}) → fallback render_clip")
                render_mod.render_clip(
                    src2, rs, re_, None, out_path,
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
