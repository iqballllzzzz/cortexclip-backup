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
    """Header untuk permintaan atas nama pengguna.

    token kosong => pakai service key. Ini terjadi pada pemanggil INTERNAL
    (pra-render setelah pipeline): tanpa ini httpx menolak dengan
    "Illegal header value b'Bearer '" dan preview gagal disimpan.
    """
    if not token:
        return _service_headers()
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
    """Load project + clip rows via PostgREST using the user's token.

    token kosong = pemanggil INTERNAL (pra-render setelah pipeline). Dalam mode
    itu service key dipakai: tidak ada permintaan pengguna yang membawa token,
    tapi kepemilikan sudah dipastikan oleh pipeline yang membuat klipnya.
    """
    headers = _user_headers(token)
    async with httpx.AsyncClient(timeout=30) as client:
        pr = await client.get(
            f"{SUPABASE_URL}/rest/v1/projects?id=eq.{project_id}&select=*",
            headers=headers,
        )
        cr = await client.get(
            f"{SUPABASE_URL}/rest/v1/clips?id=eq.{clip_id}&select=*",
            headers=headers,
        )
    if pr.status_code != 200 or cr.status_code != 200:
        raise RuntimeError("Gagal memuat project/clip")
    projects = pr.json()
    clips = cr.json()
    if not projects or not clips:
        raise RuntimeError("Project atau klip tidak ditemukan")
    return projects[0], clips[0]


async def _watermark_aktif_untuk(user_id: str) -> bool:
    """True kalau unduhan user ini HARUS diberi watermark.

    Satu sumber kebenaran, dipakai render final maupun diuji langsung. Aturan:
    watermark MATI kalau (a) premium masih aktif, (b) flag watermark_removed
    dipasang (hasil menuntaskan iklan), atau (c) sudah 4 iklan hapus-watermark.
    """
    from datetime import datetime, timezone
    try:
        async with httpx.AsyncClient(timeout=10) as c:
            pr = await c.get(
                f"{SUPABASE_URL}/rest/v1/profiles?user_id=eq.{user_id}"
                "&select=ads_watched,watermark_removed,premium_until",
                headers={"apikey": SUPABASE_SERVICE_KEY_ENV,
                         "Authorization": f"Bearer {SUPABASE_SERVICE_KEY_ENV}"},
            )
            rows = pr.json() if pr.status_code == 200 else []
    except Exception as exc:
        print(f"[render] cek watermark gagal ({exc}) → watermark tetap ON")
        return True
    if not rows:
        return True
    row = rows[0]
    premium_aktif = False
    pu = row.get("premium_until")
    if pu:
        try:
            d = datetime.fromisoformat(str(pu).replace("Z", "+00:00"))
            if not d.tzinfo:
                d = d.replace(tzinfo=timezone.utc)
            premium_aktif = d > datetime.now(timezone.utc)
        except ValueError:
            premium_aktif = False
    if premium_aktif:
        print("[render] user PREMIUM → tanpa watermark")
        return False
    if row.get("watermark_removed") or int(row.get("ads_watched") or 0) >= 4:
        return False
    return True


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
                em_size = max(24, int(get_scaled_font_size(base_fs, vw) * 1.12))
                emoji_count = 0
                em_items: list[dict[str, Any]] = []
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
                    em_items.append({
                        "png": png,
                        "x": int(vw * 0.96 - em_size / 2),
                        "y": int(vh * pos_pct / 100.0),
                        "size": em_size,
                        "t_start": t_start_w,
                        "t_end": t_end_w + 1.0,
                    })
                    emoji_count += 1
                # PARITY: preview hanya menampilkan SATU emoji sekaligus
                # (activeLine.find). Potong t_end kalau emoji berikutnya sudah
                # mulai, supaya tidak ada dua emoji bertumpuk di render.
                for i, it in enumerate(em_items):
                    if i + 1 < len(em_items):
                        nxt = em_items[i + 1]["t_start"]
                        if it["t_end"] > nxt:
                            it["t_end"] = max(it["t_start"] + 0.2, nxt - 0.02)
                icon_png_overlays.extend(em_items)
            except Exception as exc:
                print(f"[render] emoji overlay gagal (render tetap jalan): {exc}")

        # IKON & B-ROLL overlay: planner baru (genre-aware, katalog 500+).
        # PARITY: preview memuat PNG dari GET /api/icons/{icon_id} — berkas
        # yang SAMA dengan yang dibakar ffmpeg di sini.
        #
        # CATATAN URUTAN: di sini HANYA rencana (kapan & aset apa) yang dibuat.
        # POSISI ikon/b-roll dihitung SETELAH face tracking & auto split
        # diketahui (lihat blok "TATA LETAK OVERLAY" di bawah), karena posisi
        # yang benar butuh tahu di mana wajah berada dan di mana subtitle
        # berada pada momen itu.
        broll_video_overlays: list[dict[str, Any]] = []
        placements: list[dict[str, Any]] = []
        if broll_enabled:
            try:
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
                    placements = await plan_overlays(words, duration, genre=genre) or []
                    print(f"[render] genre={genre} overlay baru={len(placements)}")
                    # SIMPAN supaya render ulang / preview berikutnya IDENTIK
                    # (planner AI temperature 0.4 → tiap panggilan beda).
                    if placements:
                        try:
                            async with httpx.AsyncClient(timeout=20) as _c:
                                await _c.patch(
                                    f"{SUPABASE_URL}/rest/v1/clips?id=eq.{clip_id}",
                                    json={"overlay_plan": placements},
                                    headers={"apikey": SUPABASE_SERVICE_KEY_ENV,
                                             "Authorization": f"Bearer {SUPABASE_SERVICE_KEY_ENV}",
                                             "Content-Type": "application/json"},
                                )
                        except Exception as exc:
                            print(f"[render] simpan overlay_plan gagal: {exc}")
            except Exception as exc:
                print(f"[render] rencana overlay gagal (render tetap jalan): {exc}")
                placements = []

        # start/end sudah dihitung relatif terhadap segmen di atas
        out_name = f"{uuid.uuid4().hex[:10]}.mp4"
        out_path = os.path.join(workdir, out_name)

        traj = None
        cam_cuts: list[int] = []
        cam_fps = 15.0
        cam_rolls: list[float] = []
        lay_frames: list[dict[str, Any]] = []
        st_full: dict[str, Any] = {}
        if face_tracking:
            try:
                st = render_mod.analyze_speaker_track(src, start, end)
                st_full = st if isinstance(st, dict) else {}
                traj = st.get("trajectory") or None
                cam_cuts = list(st.get("cuts") or [])
                cam_fps = float(st.get("analysis_fps") or 15.0)
                cam_rolls = list(st.get("roll") or [])
                lay_frames = list(st.get("layout_frames") or [])
                print(f"[render] speaker track: mesin={st.get('engine', 'mesh')} "
                      f"wajah={st.get('faces')} "
                      f"pindah={st.get('switches')} cuts={len(cam_cuts)} "
                      f"fps={cam_fps} roll={len(cam_rolls)}")
                # Face tracking TIDAK BOLEH mati senyap: kalau trajektorinya
                # terlalu pendek atau tidak ada wajah, katakan di log dan pakai
                # crop tengah — jangan diam-diam menghasilkan klip yang framing-
                # nya salah tanpa jejak apa pun.
                if not traj or len(traj) < 2:
                    print("[render] PERINGATAN face tracking: trajektori kosong "
                          f"(wajah={st.get('faces')}) → crop tengah")
                    traj = None
            except Exception as exc:
                import traceback
                print(f"[render] FACE TRACKING GAGAL: {exc.__class__.__name__}: {exc}")
                traceback.print_exc()
                traj = None

        # Watermark: satu sumber kebenaran di _watermark_aktif_untuk() supaya
        # aturannya bisa diuji langsung dan tidak menyimpang dari yang dipakai UI.
        user_id = clip.get("user_id") or project.get("user_id")
        watermark_on = await _watermark_aktif_untuk(str(user_id))

        # AUTO SPLIT (pengganti auto layout, resep openshorts): satu keputusan —
        # split atau tidak. lay_frames + audio sudah ada di tangan.
        # Split dirender lewat render_mod.render_auto_split (vstack dua crop
        # statis per orang, geometri openshorts).
        lay_seg: list[dict[str, Any]] = []
        try:
            from . import auto_split
            prefs = clip.get("layout_prefs") or {}
            if prefs.get("enabled"):
                rencana = auto_split.rencana_auto_split(
                    {**st_full,
                     "layout_frames": lay_frames, "analysis_fps": cam_fps},
                    src_w=int(st_full.get("src_w") or 0))
                lay_seg = rencana.get("splits") or []
                if lay_seg:
                    print(f"[render] auto split: {len(lay_seg)} rentang "
                          + "; ".join(f"{s['start']:.1f}-{s['end']:.1f}s"
                                      for s in lay_seg))
        except Exception as exc:
            print(f"[render] auto split gagal ({str(exc)[:150]}) → kamera saja")
            lay_seg = []

        # SUBTITLE DI SEAM saat split: ASS dibangun di atas (sebelum rencana
        # split diketahui), jadi kalau ada rentang split kita BANGUN ULANG
        # dengan split_ranges → event di dalam rentang memakai \an5 di garis
        # batas panel. Tanpa ini caption menutupi wajah orang di panel bawah.
        if lay_seg:
            try:
                ass2 = build_ass(words, style, video_width=vw, video_height=vh,
                                 split_ranges=lay_seg)
                with open(ass_path, "w", encoding="utf-8") as f:
                    f.write(ass2)
                print(f"[render] subtitle: {len(lay_seg)} rentang split → seam \\an5")
            except Exception as exc:
                print(f"[render] subtitle seam gagal ({str(exc)[:120]}) → posisi normal")

        # ================= TATA LETAK OVERLAY (anti-tabrakan) =================
        # Posisi ikon & b-roll dihitung DI SINI, setelah wajah (st_full) dan
        # rentang split diketahui. Sebelumnya posisinya tetap (ikon 26% tinggi,
        # b-roll 44%) sehingga pada close-up ikon jatuh tepat di wajah dan
        # b-roll bisa menutupi subtitle. Sekarang tiap overlay diberi posisi
        # yang tumpang-tindihnya paling kecil terhadap wajah + band subtitle.
        # Waktu b-roll juga digeser supaya tidak muncul bersamaan dengan ikon.
        if placements:
            try:
                from anyio import to_thread

                from . import overlay_layout as OL
                from .broll_video import broll_local_path
                from .icon_png import icon_png_from_id

                st_pos = {**st_full, "layout_frames": lay_frames,
                          "analysis_fps": cam_fps, "trajectory": traj or []}
                sub_pct = float(style.get("position", 75) or 75)
                dur_klip = max(0.5, float(end) - float(start))
                rencana_waktu = OL.jadwalkan(placements, dur_klip)

                ikon_frac = 0.24                      # lebar ikon (fraksi vw)
                # ikon berbentuk persegi di piksel: lebar 24% dari vw, jadi
                # tingginya 0.24*vw px = 0.24*vw/vh fraksi tinggi frame
                ikon_h_frac = ikon_frac * vw / vh
                bw = int(vw * 0.74)
                bh = int(bw * 9 / 16)
                bw_frac, bh_frac = bw / vw, bh / vh

                for p in rencana_waktu:
                    icon_id = str(p.get("icon_id") or "StarIcon")
                    png = icon_png_from_id(icon_id)
                    if not png:
                        continue
                    ts = float(p.get("time_start", 0))
                    te = max(ts + 0.5, float(p.get("time_end", ts + 2.5)))
                    # PARITY: kalau broll_api sudah menyimpan koordinat, PAKAI.
                    # Menghitung ulang di sini bisa memberi angka berbeda
                    # (camera_track tersimpan vs analisis baru) → preview dan
                    # unduhan tidak sama, padahal itu janji produk.
                    if p.get("icon_cx") is not None:
                        icx = float(p["icon_cx"])
                        icy = float(p.get("icon_cy", 0.26))
                        alasan = str(p.get("icon_reason") or "tersimpan")
                    else:
                        icx, icy, alasan = OL.posisi_ikon(
                            st_pos, ts, ikon_frac, ikon_h_frac, sub_pct,
                            split_ranges=lay_seg)
                    icon_png_overlays.append({
                        "png": png,
                        "x": int(vw * icx), "y": int(vh * icy),
                        "size": int(vw * ikon_frac),
                        "t_start": ts, "t_end": te,
                        "anim": str(p.get("animation") or "slide-left"),
                    })
                    print(f"[overlay] ikon t={ts:.1f}s → ({icx:.2f},{icy:.2f}) {alasan}")

                    burl = p.get("broll_url")
                    if not burl:
                        if p.get("broll_skip_reason"):
                            print(f"[overlay] b-roll t={ts:.1f}s dilewati: "
                                  f"{p['broll_skip_reason']}")
                        continue
                    bfile = await to_thread.run_sync(broll_local_path, str(burl))
                    if not bfile:
                        continue
                    b0 = float(p.get("broll_start", ts))
                    b1 = float(p.get("broll_end", te))
                    # PARITY: pakai koordinat & skala tersimpan kalau ada
                    if p.get("broll_cy") is not None:
                        bcx = float(p.get("broll_cx", 0.5))
                        bcy = float(p["broll_cy"])
                        bskala = float(p.get("broll_scale", 1.0))
                        alasan_b = str(p.get("broll_reason") or "tersimpan")
                    else:
                        # ikon yang sedang tampil di jendela b-roll juga dihindari
                        hindari = [OL._kotak(icx, icy, ikon_frac, ikon_h_frac)] \
                            if b0 < te else []
                        bcx, bcy, alasan_b, bskala = OL.posisi_broll(
                            st_pos, b0, bw_frac, bh_frac, sub_pct,
                            split_ranges=lay_seg, dihindari=hindari)
                    bw2 = int(bw * bskala) - (int(bw * bskala) % 2)
                    bh2 = int(bh * bskala) - (int(bh * bskala) % 2)
                    broll_video_overlays.append({
                        "file": bfile,
                        "x": int(vw * bcx) - bw2 // 2,
                        "y": int(vh * bcy) - bh2 // 2,
                        "width": bw2, "height": bh2,
                        "t_start": b0, "t_end": b1,
                    })
                    print(f"[overlay] b-roll t={b0:.1f}-{b1:.1f}s "
                          f"(ikon di {ts:.1f}s) → y={bcy:.2f} "
                          f"skala={bskala:.0%} {alasan_b}")
            except Exception as exc:
                import traceback
                print(f"[render] tata letak overlay gagal ({str(exc)[:150]})")
                traceback.print_exc()

        render_mod.render_clip(
            src, start, end, ass_path, out_path,
            resolution=resolution,
            face_tracking=bool(traj),
            camera_trajectory=traj,
            camera_cuts=cam_cuts,
            camera_fps=cam_fps,
            auto_splits=lay_seg or None,
            camera_rolls=cam_rolls or None,
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


def _cam_track_dari(st: dict[str, Any], fps: float,
                    cuts: list[int]) -> dict[str, Any]:
    """Bagian hasil analisis yang layak disimpan ke clips.camera_track.

    Hanya `layout_frames` + fps + cuts + src_w. Trajektori penuh TIDAK disimpan:
    panel auto split tidak memakainya dan ia membesarkan baris DB tanpa guna.
    src_w WAJIB: rencana_auto_split menolak jalan tanpa itu (ambang fraksi
    lebar tidak bermakna tanpa lebar sumber).

    Kenapa penting: menghitung layout_frames butuh analisis wajah penuh (44 detik
    untuk klip 61 detik). Tanpa disimpan di sini, membuka panel auto layout
    memicu analisis ULANG dari nol — itu sebabnya tombolnya terasa mati/lemot.
    Terukur: 34 dari 38 klip tidak punya camera_track sebelum perbaikan ini.
    """
    return {
        "layout_frames": st.get("layout_frames") or [],
        "analysis_fps": float(fps),
        "cuts": list(cuts or []),
        "src_w": int(st.get("src_w") or 0),
        "audio": (st.get("audio") if isinstance(st.get("audio"), list) else None),
    }


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

    # CACHE HIT wajib memeriksa preview_url juga.
    # Tanpa syarat itu, klip yang preview_url-nya dikosongkan (mis. saat dipaksa
    # dibuat ulang) tapi preview_ready-nya masih true akan SELALU dianggap sudah
    # jadi: fungsi ini balik seketika membawa url None, jadi tidak pernah
    # dirender ulang dan editor tidak punya video. Terukur: 7 klip tersangkut
    # dengan ready=True tapi url=KOSONG, dan tiap permintaan render balik "OK 0s".
    if (clip.get("preview_style_hash") == style_hash
            and clip.get("preview_ready")
            and clip.get("preview_url")):
        # cache hit — preview video murni sudah ada (subtitle via live overlay)
        return {
            "file": f"{clip_id}.mp4",
            "storage_path": f"{clip.get('user_id')}/previews/{clip_id}.mp4",
            "url": clip["preview_url"],
            "cached": True,
        }

    workdir = tempfile.mkdtemp(prefix="cortexclip_preview_")
    from .preview_progress import set_progress
    try:
        abs_start = float(clip["start_time"])
        abs_end = min(float(clip["end_time"]), abs_start + max_seconds)
        out_name = f"{uuid.uuid4().hex[:10]}.mp4"
        out_path = os.path.join(workdir, out_name)

        # Kemajuan dilaporkan ke UI supaya tidak ada layar hitam tanpa
        # keterangan. Skala: 0-90% = encode, 90-99% = unggah, 100% = siap.
        def lapor(pct: int, tahap: str = "Menyiapkan video") -> None:
            set_progress(clip_id, pct, tahap)

        lapor(2, "Menyiapkan video")

        # SUMBER: coba HTTP-seek dulu (tanpa unduh file penuh) — ini yang
        # membuat preview klip di menit ke-50 video 1 jam tetap cepat.
        # Kalau gagal (bucket privat / codec butuh index) → unduh lokal.
        #
        # FACE TRACKING DI PREVIEW: preview WAJIB memakai framing yang sama
        # dengan hasil unduhan, kalau tidak user melihat crop tengah di editor
        # lalu hasilnya berbeda. Analisis dijalankan lebih dulu di sini dan
        # trajektorinya dipakai oleh kedua jalur.
        traj = None
        cam_cuts: list[int] = []
        cam_fps = 15.0
        cam_rolls: list[float] = []
        # Hasil analisis lengkap, disimpan ke clips.camera_track di akhir supaya
        # panel Auto Split tidak perlu menganalisis ulang (lihat komentar di PATCH).
        cam_track: dict[str, Any] = {}
        auto_splits: list[dict[str, Any]] = []

        seek_url = await _source_seek_url(project)
        made = False
        if seek_url:
            try:
                lapor(4, "Mengambil video")
                # WAJIB di thread terpisah: analisis + ffmpeg adalah kerja CPU
                # sinkron. Kalau dijalankan langsung di task asyncio, seluruh
                # event loop TERBLOKIR — terukur: POST /api/preview-clip baru
                # balik setelah 16 detik dan endpoint status tidak bisa dijawab,
                # jadi persen tidak pernah terlihat.
                st = await to_thread.run_sync(
                    lambda: render_mod.analyze_speaker_track(
                        seek_url, abs_start, abs_end,
                        # analisis = bagian terlama (44s untuk klip 61s), jadi
                        # persennya harus terlihat bergerak: 4-58%.
                        # Tahapnya dibedakan: selama p==0 video masih DIUNDUH
                        # dari storage (frame pertama butuh 6-12 detik untuk
                        # klip di menit ke-20), dan menyebutnya "Menganalisis
                        # wajah" membuat pengguna melihat 4% yang seolah macet.
                        on_progress=lambda p: lapor(
                            4 + int(p * 0.54),
                            "Mengambil video" if p <= 0 else "Menganalisis wajah")))
                traj = st.get("trajectory") or None
                cam_cuts = list(st.get("cuts") or [])
                cam_fps = float(st.get("analysis_fps") or 15.0)
                cam_rolls = list(st.get("roll") or [])
                cam_track = _cam_track_dari(st, cam_fps, cam_cuts)
                if not traj or len(traj) < 2:
                    print("[preview] face tracking kosong → crop tengah")
                    traj = None
                # AUTO SPLIT: rencana sekali di sini, dipakai kedua jalur
                # preview (fast & fallback). Waktu pada sumber = waktu klip
                # (analisis dari abs_start), jadi langsung dipakai.
                try:
                    from . import auto_split
                    prefs = clip.get("layout_prefs") or {}
                    auto_splits = []
                    if prefs.get("enabled"):
                        rencana = auto_split.rencana_auto_split(
                            st, src_w=int(st.get("src_w") or 0))
                        auto_splits = rencana.get("splits") or []
                    if auto_splits:
                        print(f"[preview] auto split: "
                              + "; ".join(f"{s['start']:.1f}-{s['end']:.1f}s"
                                          for s in auto_splits))
                except Exception as exc:
                    print(f"[preview] auto split gagal ({str(exc)[:120]})")
                    auto_splits = []
                # simpan rencana split ke camera_track supaya bisa diverifikasi
                # dan dipakai caption tanpa analisis ulang
                cam_track = {**cam_track, "auto_splits": auto_splits}
            except Exception as exc:
                print(f"[preview] face tracking gagal ({str(exc)[:120]}) → crop tengah")
                traj = None
                cam_rolls = []
            try:
                await to_thread.run_sync(lambda: render_mod.render_preview_fast(
                    seek_url, abs_start, abs_end, out_path,
                    camera_trajectory=traj, camera_cuts=cam_cuts,
                    camera_fps=cam_fps, camera_rolls=cam_rolls or None,
                    auto_splits=auto_splits or None,
                    on_progress=lambda p: lapor(60 + int(p * 0.30),
                                                "Memproses video")))
                made = os.path.exists(out_path) and os.path.getsize(out_path) > 8000
                if made:
                    print("[preview] jalur HTTP-seek (tanpa unduh penuh)"
                          f" face_tracking={bool(traj)}")
            except Exception as exc:
                print(f"[preview] HTTP-seek gagal ({str(exc)[:120]}) → unduh lokal")

        if not made:
            lapor(5, "Mengambil potongan sumber")
            src = os.path.join(workdir, "source.mp4")
            src2, rs, re_ = await _ensure_source_segment(
                project, src, abs_start, abs_end)
            # trajektori harus dihitung ulang: potongan lokal punya basis waktu
            # sendiri (rs/re_), jadi indeks frame trajektori sebelumnya salah
            try:
                lapor(8, "Menganalisis wajah")
                st = await to_thread.run_sync(
                    lambda: render_mod.analyze_speaker_track(
                        src2, rs, re_,
                        on_progress=lambda p: lapor(
                            8 + int(p * 0.50), "Menganalisis wajah")))
                traj = st.get("trajectory") or None
                cam_cuts = list(st.get("cuts") or [])
                cam_fps = float(st.get("analysis_fps") or 15.0)
                cam_rolls = list(st.get("roll") or [])
                cam_track = _cam_track_dari(st, cam_fps, cam_cuts)
                if not traj or len(traj) < 2:
                    traj = None
                # AUTO SPLIT jalur fallback: JANGAN merencanakan ulang. Pakai
                # `auto_splits` yang sudah dihitung pada jalur HTTP-seek —
                # waktunya relatif KLIP (analisis abs_start..abs_end), dan
                # render fallback juga berbasis waktu klip (-ss rs oleh ffmpeg
                # menggeser ke 0 = waktu klip). Merencanakan ulang pada st
                # potongan lokal terbukti menghasilkan rentang kosong/beda.
                try:
                    auto_splits2 = list(auto_splits or [])
                    if auto_splits2:
                        print("[preview] auto split(fallback): "
                              + "; ".join(f"{s['start']:.1f}-{s['end']:.1f}s"
                                          for s in auto_splits2))
                except Exception as exc:
                    print(f"[preview] auto split(fallback) gagal ({str(exc)[:120]})")
                    auto_splits2 = []
                # gabungkan rencana dari jalur mana pun ke camera_track yang
                # disimpan (yang dipakai E2E & caption)
                cam_track = {**cam_track, "auto_splits": auto_splits2}
            except Exception as exc:
                print(f"[preview] face tracking gagal ({exc}) → crop tengah")
                traj = None
                auto_splits2 = []
            try:
                await to_thread.run_sync(lambda: render_mod.render_preview_fast(
                    src2, rs, re_, out_path,
                    camera_trajectory=traj, camera_cuts=cam_cuts,
                    camera_fps=cam_fps, camera_rolls=cam_rolls or None,
                    auto_splits=auto_splits2 or None,
                    on_progress=lambda p: lapor(15 + int(p * 0.75),
                                                "Memproses video")))
            except Exception as exc:
                print(f"[preview] fast path gagal ({exc}) → fallback render_clip")
                lapor(15, "Memproses video (mode aman)")
                await to_thread.run_sync(lambda: render_mod.render_clip(
                    src2, rs, re_, None, out_path,
                    resolution=resolution,
                    face_tracking=bool(traj),
                    camera_trajectory=traj,
                    camera_cuts=cam_cuts,
                    camera_fps=cam_fps,
                    watermark=False,
                ))

        lapor(92, "Mengunggah preview")
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
                    # camera_track DISIMPAN di sini, bukan hanya oleh endpoint
                    # rencana layout. Tanpa ini, membuka panel auto layout memaksa
                    # analisis wajah ULANG dari nol (44 detik untuk klip 61s), jadi
                    # tombolnya terlihat "tidak bisa dipencet" dan aplikasi terasa
                    # lemot. Terukur: 34 dari 38 klip TIDAK punya camera_track
                    # karena preview tidak pernah menyimpannya.
                    # layout_frames-lah yang paling mahal dihitung, dan ia sudah
                    # ada di tangan kita di sini — membuangnya lalu menghitung
                    # ulang saat panel dibuka adalah pemborosan murni.
                    **({"camera_track": cam_track} if cam_track else {}),
                },
            )

        lapor(100, "Selesai")
        return {
            "file": out_name,
            "storage_path": storage_key,
            "url": preview_url,
        }
    finally:
        import shutil
        shutil.rmtree(workdir, ignore_errors=True)
        # entri kemajuan TIDAK dihapus di sini: klien yang sedang polling harus
        # bisa melihat 100%. preview_progress membersihkannya sendiri (MAX_AGE_S).
