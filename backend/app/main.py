"""CortexClip backend API.

Endpoints (all auth via Supabase user JWT, validated against auth service):
  POST /api/transcribe/chunk   {audio_base64, offset, duration, job_id} -> segments
  POST /api/transcribe/commit  {job_id} -> assembles transcript from chunks
  POST /api/jobs               {project_id, target_count, caption_style} -> job_id
  GET  /api/jobs/{job_id}      -> status/progress/clips
  GET  /files/{name}           -> rendered clip mp4
  GET  /api/hydra/status       -> AI endpoint health (admin)
  POST /api/admin/login        -> admin session
"""

from __future__ import annotations

import os
import re
import json
import base64
import binascii
import asyncio
import secrets
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from dotenv import load_dotenv
load_dotenv(override=True)  # ensure .env is loaded even when parent process has empty placeholder vars

import httpx
import jwt as pyjwt
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from .hydra import gateway, HydraError
from . import jobs as jobs_mod
from .jobs import jobs, run_pipeline, update_project
from .subtitles import build_ass, build_srt, DEFAULT_STYLE, EFFECTS, STYLE_PRESETS

SUPABASE_URL = os.environ.get("SUPABASE_URL", "http://localhost:8000")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")

# Admin credentials (env override) — user logs in here for the admin panel.
ADMIN_USER = os.environ.get("ADMIN_USER", "admin")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
ADMIN_TOKENS: dict[str, float] = {}  # token -> expiry

# Task preview yang sedang jalan: clip_id -> asyncio.Task.
# Preview dijalankan LEPAS dari request supaya user boleh menutup halaman
# tanpa membatalkan proses (dan supaya request tidak menahan koneksi lama).
_preview_tasks: dict[str, "asyncio.Task[Any]"] = {}

app = FastAPI(title="CortexClip Backend", version="1.0.0")

origins = os.environ.get("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins != ["*"] else ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

async def get_user(request: Request, authorization: str | None = None,
                   check_ban: bool = True) -> dict[str, Any]:
    """Validate the Supabase user JWT and return {id, email}.

    check_ban=True (default) memblokir user yang sedang diban dengan HTTP 403
    berisi detail ban supaya frontend bisa menampilkan layar ban.
    """
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1]
    if not token:
        token = request.headers.get("apikey")
    if not token:
        raise HTTPException(401, "Missing token")
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"},
        )
    if resp.status_code != 200:
        raise HTTPException(401, "Invalid token")
    data = resp.json()
    user = {"id": data["id"], "email": data.get("email", "")}
    if check_ban:
        try:
            from . import admin as admin_mod
            ban = await admin_mod.ban_state(user["id"])
        except Exception as exc:      # analitik/ban gagal != request gagal
            print(f"[auth] cek ban gagal: {exc}")
            ban = None
        if ban:
            raise HTTPException(403, {"code": "account_banned", **ban})
    return user


def require_admin(authorization: str | None) -> None:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing admin token")
    token = authorization.split(" ", 1)[1]
    exp = ADMIN_TOKENS.get(token)
    if not exp or exp < time.time():
        ADMIN_TOKENS.pop(token, None)
        raise HTTPException(401, "Admin token expired")


# ---------------------------------------------------------------------------
# Validasi ID dari URL/body
# ---------------------------------------------------------------------------

_UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)

# cache showcase landing page: (waktu_isi, payload) — lihat /api/showcase
_SHOWCASE_CACHE: tuple[float, dict[str, Any]] | None = None


def ensure_uuid(value: str, label: str = "Proyek") -> str:
    """ID yang dipakai di query Postgres WAJIB UUID.

    Tanpa ini, id ngawur (mis. /api/projects/abc/reprocess) bikin PostgREST
    balas 400 `22P02 invalid input syntax for type uuid` → sb() raise
    RuntimeError → 500 Internal Server Error + detail error DB bocor ke user.
    Yang benar: perlakukan seperti data tidak ada → 404.
    """
    if not _UUID_RE.match(str(value or "")):
        raise HTTPException(404, f"{label} tidak ditemukan / bukan milikmu")
    return str(value)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class ChunkIn(BaseModel):
    audio_base64: str
    offset: float
    duration: float
    job_id: str


class CommitIn(BaseModel):
    job_id: str
    project_id: str
    language: str = "auto"


class JobIn(BaseModel):
    project_id: str
    user_id: str
    media_path: str
    target_count: int = 10
    caption_style: dict[str, Any] | None = None


class AdminLogin(BaseModel):
    username: str
    password: str


class YoutubeIn(BaseModel):
    url: str
    target_count: Optional[int] = None


class CheckoutIn(BaseModel):
    plan: str


class AssIn(BaseModel):
    words: list[dict[str, Any]]
    style: dict[str, Any] | None = None


class RenderClipIn(BaseModel):
    project_id: str
    clip_id: str
    caption_style: dict[str, Any] | None = None
    resolution: str = "720x1280"
    face_tracking: bool = True
    hook_text: str | None = None


# ---------------------------------------------------------------------------
# Health & meta
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"ok": True, "service": "cortexclip-backend"}


@app.get("/api/caption-effects")
async def caption_effects():
    return {
        "effects": list(EFFECTS),
        "default": DEFAULT_STYLE,
        "presets": STYLE_PRESETS,
    }


# ---------------------------------------------------------------------------
# Transcription
# ---------------------------------------------------------------------------

@app.post("/api/transcribe/chunk")
async def transcribe_chunk(body: ChunkIn, request: Request, authorization: str | None = Header(None)):
    await get_user(request, authorization)
    from .transcribe import transcribe_wav_chunk
    from .limits import TranscribeSlot
    try:
        wav = base64.b64decode(body.audio_base64, validate=False)
    except (binascii.Error, ValueError):
        raise HTTPException(400, "audio_base64 tidak valid")
    if len(wav) < 1000:
        raise HTTPException(400, "audio terlalu pendek")
    try:
        # throttle: max N transkripsi concurrent — sisanya antri (gateway AI gak down)
        with TranscribeSlot():
            segments = await transcribe_wav_chunk(wav, body.offset, body.duration)
    except HydraError as exc:
        raise HTTPException(503, str(exc))
    # accumulate into job transcript store
    job = jobs.setdefault(body.job_id, {"status": "transcribing", "progress": 0, "segments": []})
    job["segments"] = (job.get("segments") or []) + segments
    job["status"] = "transcribing"
    return {"segments": segments, "total_segments": len(job["segments"])}


@app.post("/api/transcribe/commit")
async def transcribe_commit(body: CommitIn, request: Request, authorization: str = Header(None)):
    user = await get_user(request, authorization)
    job = jobs.get(body.job_id)
    if not job:
        raise HTTPException(404, "Job tidak ditemukan")
    segments = job.get("segments") or []
    if not segments:
        raise HTTPException(400, "Belum ada segmen transkrip untuk job ini")
    from .transcribe import transcript_with_words
    segments.sort(key=lambda s: s["start"])
    duration = max(s["end"] for s in segments)
    transcript = {"language": body.language, "duration": round(duration, 2), "segments": transcript_with_words(segments)}
    job["transcript"] = transcript
    # persist to Supabase project row
    try:
        await update_project(body.project_id, transcript=transcript, duration_seconds=round(duration))
    except Exception as exc:
        # non-fatal: pipeline still works from memory
        print(f"[jobs] persist transcript failed: {exc}")
    return {"segments": len(segments), "duration": transcript["duration"]}


# ---------------------------------------------------------------------------
# Jobs
# ---------------------------------------------------------------------------

@app.post("/api/jobs")
async def create_job(body: JobIn, request: Request, authorization: str = Header(None)):
    user = await get_user(request, authorization)
    if user["id"] != body.user_id:
        raise HTTPException(403, "user_id mismatch")
    if not os.path.isfile(body.media_path):
        raise HTTPException(400, f"media_path tidak valid: {body.media_path}")
    job_id = uuid.uuid4().hex
    jobs[job_id] = {"status": "queued", "progress": 0, "project_id": body.project_id,
                    "user_id": user["id"], "created": time.time()}
    from .background import spawn
    spawn(run_pipeline(
        job_id, body.project_id, user["id"], body.media_path,
        body.target_count, body.caption_style,
    ), name=f"pipeline:{job_id[:8]}", key=f"pipeline:{job_id}")
    return {"job_id": job_id}


@app.get("/api/jobs/{job_id}")
async def job_status(job_id: str, request: Request, authorization: str = Header(None)):
    await get_user(request, authorization)
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job tidak ditemukan")
    return {k: v for k, v in job.items() if k not in ("segments", "transcript")}


@app.get("/files/{name}")
async def serve_file(name: str):
    safe = os.path.basename(name)
    path = os.path.join(jobs_mod.OUTPUT_DIR, safe)
    if not os.path.isfile(path):
        raise HTTPException(404, "file tidak ditemukan")
    return FileResponse(path, media_type="video/mp4", filename=safe)


# ---------------------------------------------------------------------------
# Subtitle generation (preview parity: same builder for browser preview)
# ---------------------------------------------------------------------------

@app.post("/api/subtitles/ass")
async def make_ass(body: AssIn, request: Request, authorization: str = Header(None)):
    await get_user(request, authorization)
    try:
        ass = build_ass(body.words, body.style)
    except Exception as exc:
        raise HTTPException(400, f"gagal membuat ASS: {exc}")
    return {"ass": ass}


@app.post("/api/subtitles/srt")
async def make_srt(body: AssIn, request: Request, authorization: str = Header(None)):
    await get_user(request, authorization)
    return {"srt": build_srt(body.words)}


# ---------------------------------------------------------------------------
# Server-side clip render (MP4 via ffmpeg on the VPS)
# ---------------------------------------------------------------------------

@app.post("/api/render-clip")
async def api_render_clip(body: RenderClipIn, request: Request, authorization: str = Header(None)):
    await get_user(request, authorization)
    from .render_clip import render_clip_server
    try:
        result = await render_clip_server(
            body.project_id, body.clip_id, token=authorization.split(" ", 1)[1],
            caption_style=body.caption_style,
            resolution=body.resolution,
            face_tracking=body.face_tracking,
            hook_text=body.hook_text,
        )
    except Exception as exc:
        raise HTTPException(400, str(exc))
    return result


@app.post("/api/preview-clip")
async def api_preview_clip(body: RenderClipIn, request: Request, authorization: str | None = Header(None)):
    """Preview klip resolusi rendah — jalan di BACKGROUND.

    Tidak menahan koneksi: task dijalankan lepas dari request, jadi kalau user
    menutup tab/keluar halaman prosesnya TETAP selesai dan hasilnya tersimpan
    (clips.preview_url + preview_ready). Klien memantau lewat
    GET /api/preview-clip/status/{clip_id}.
    """
    user = await get_user(request, authorization)
    from .render_clip import render_preview_clip
    token = authorization.split(" ", 1)[1] if authorization and " " in authorization else ""

    # sudah ada? balas langsung (cache hit, tanpa render)
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(
            f"{SUPABASE_URL}/rest/v1/clips?id=eq.{body.clip_id}"
            "&select=preview_url,preview_ready",
            headers={"apikey": SUPABASE_SERVICE_KEY,
                     "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"},
        )
    rows = r.json() if r.status_code == 200 else []
    if rows and rows[0].get("preview_ready") and rows[0].get("preview_url"):
        return {"status": "ready", "url": rows[0]["preview_url"], "cached": True}

    key = f"preview:{body.clip_id}"
    from .background import sedang_jalan, spawn
    if sedang_jalan(key):
        # SINKRONISASI: klien yang baru masuk (keluar-masuk editor, tab kedua)
        # HARUS bisa menempel ke proses yang sedang jalan, bukan memulai ulang.
        # Persen terakhir dikirim di sini juga supaya tirai langsung menunjukkan
        # angka yang benar tanpa menunggu polling pertama.
        from .preview_progress import get_progress
        p = get_progress(body.clip_id) or {}
        return {"status": "processing", "url": None,
                "progress": int(p.get("pct", 0)),
                "stage": p.get("tahap") or "Menyiapkan"}

    async def run_preview():
        t0 = time.time()
        try:
            await render_preview_clip(
                body.project_id, body.clip_id, token=token,
                caption_style=body.caption_style,
            )
            from .admin import log_usage
            await log_usage(user["id"], "preview", model="ffmpeg-preview",
                            provider="local",
                            latency_ms=int((time.time() - t0) * 1000),
                            project_id=body.project_id)
        except asyncio.CancelledError:
            # dibatalkan karena layout berubah — bukan kegagalan, jangan
            # ditandai gagal (klien akan memulai render baru yang benar)
            from .preview_progress import clear_progress as _cp
            _cp(body.clip_id)
            raise
        except Exception as exc:
            print(f"[preview] gagal: {exc}")
            # TANDAI GAGAL. Tanpa ini task mati → status "idle" → klien memulai
            # render baru dari nol, berulang tanpa akhir dan tanpa memberi tahu
            # penyebabnya (keluhan: "5 persen terus 3 persen terus 60 persen
            # terus nurun lagi, gaada habisnya").
            try:
                from .preview_progress import set_gagal
                pesan = str(exc)
                if "returned non-zero exit status" in pesan:
                    pesan = "Render video gagal di server (ffmpeg)"
                set_gagal(body.clip_id, pesan)
            except Exception:
                pass
            try:
                from .admin import log_usage
                await log_usage(user["id"], "preview", model="ffmpeg-preview",
                                provider="local", status="error",
                                project_id=body.project_id,
                                meta={"error": str(exc)[:200]})
            except Exception:
                pass

    # spawn() menyimpan referensi KUAT ke task (lihat background.py): task tanpa
    # referensi boleh dibuang GC kapan saja menurut dokumentasi asyncio, dan itu
    # penyebab "proses berhenti kalau pengguna keluar dari website".
    _preview_tasks[key] = spawn(run_preview(), name=key, key=key)
    return {"status": "processing", "url": None}


@app.get("/api/camera-track/{clip_id}")
async def api_camera_track(clip_id: str, request: Request,
                           authorization: str | None = Header(None)):
    """Jalur kamera face tracking untuk klip ini.

    Dipakai editor supaya bingkai video SUMBER langsung benar tanpa menunggu
    render server: browser menggeser crop-nya sendiri lewat CSS transform.
    Balik {static_x, src_w, src_h, crop_w} (mode kilat) atau ditambah
    {fps, x[], cuts[]} kalau analisis penuh sudah tersedia.
    """
    await get_user(request, authorization)
    ensure_uuid(clip_id, "Klip")
    from . import render as render_mod
    from .camera_track_api import get_or_build
    from .render_clip import _source_seek_url
    try:
        return await get_or_build(
            clip_id, supabase_url=SUPABASE_URL, service_key=SUPABASE_SERVICE_KEY,
            source_url_for=_source_seek_url, render_mod=render_mod)
    except Exception as exc:
        print(f"[camera-track] gagal: {exc}")
        raise HTTPException(400, str(exc)[:200])


@app.put("/api/layout-prefs/{clip_id}")
async def api_layout_prefs(clip_id: str, body: dict, request: Request,
                           authorization: str | None = Header(None)):
    """Simpan status AUTO SPLIT pengguna untuk klip ini.

    Body: {"enabled": bool}. Mengubahnya ikut MEMBATALKAN preview lama (split
    dibakar ke berkas preview supaya preview == unduhan). Field `layouts` dari
    klien lama diterima tapi diabaikan — tidak ada lagi pilihan tata letak.
    """
    user = await get_user(request, authorization)
    ensure_uuid(clip_id, "Klip")
    from .layout_api import simpan_prefs
    try:
        return await simpan_prefs(clip_id, str(user["id"]), body or {})
    except Exception as exc:
        raise HTTPException(400, str(exc)[:200])


@app.get("/api/layout-plan/{clip_id}")
async def api_layout_plan(clip_id: str, request: Request,
                          authorization: str | None = Header(None)):
    """Rentang AUTO SPLIT untuk klip ini (tanpa merender)."""
    user = await get_user(request, authorization)
    ensure_uuid(clip_id, "Klip")
    from . import render as render_mod
    from .layout_api import rencana
    from .render_clip import _source_seek_url
    try:
        return await rencana(clip_id, str(user["id"]), render_mod=render_mod,
                             source_url_for=_source_seek_url)
    except Exception as exc:
        print(f"[split-plan] gagal: {exc}")
        raise HTTPException(400, str(exc)[:200])


@app.post("/api/manual-track/{clip_id}")
async def api_manual_track(clip_id: str, body: dict, request: Request,
                           authorization: str | None = Header(None)):
    """MANUAL TRACKING — user klik subjek, kamera mengikuti di rentang scene.

    Body: {"scene_start": s, "scene_end": e, "cx": 0..1, "cy": 0..1}
    (cx/cy = titik klik pada video SUMBER 16:9, dinormalisasi).
    Menyimpan trajektori ke clips.camera_track.manual + reset preview.
    """
    user = await get_user(request, authorization)
    ensure_uuid(clip_id, "Klip")
    from anyio import to_thread

    from . import render as render_mod
    from .manual_track import simpan_manual_track
    from .render_clip import _source_seek_url
    try:
        return await simpan_manual_track(
            clip_id, str(user["id"]), body or {},
            render_mod=render_mod, source_url_for=_source_seek_url,
            run_sync=to_thread.run_sync)
    except Exception as exc:
        print(f"[manual-track] gagal: {exc}")
        raise HTTPException(400, str(exc)[:200])


@app.get("/api/manual-track/{clip_id}")
async def api_manual_track_get(clip_id: str, request: Request,
                              authorization: str | None = Header(None)):
    """Daftar scene manual tracking klip ini (untuk ditampilkan di editor)."""
    user = await get_user(request, authorization)
    ensure_uuid(clip_id, "Klip")
    import httpx as _httpx
    try:
        async with _httpx.AsyncClient(timeout=15) as c:
            r = await c.get(
                f"{SUPABASE_URL}/rest/v1/clips?id=eq.{clip_id}"
                "&select=id,user_id,camera_track",
                headers={"apikey": SUPABASE_SERVICE_KEY,
                         "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"})
        rows = r.json() if r.status_code == 200 else []
        if not rows or str(rows[0].get("user_id")) != str(user["id"]):
            raise RuntimeError("klip tidak ditemukan")
        ct = rows[0].get("camera_track") or {}
        manual = (ct.get("manual") or {}) if isinstance(ct, dict) else {}
        return {"scenes": manual.get("scenes") or []}
    except Exception as exc:
        print(f"[manual-track GET] gagal: {exc}")
        raise HTTPException(400, str(exc)[:200])


@app.post("/api/manual-track/{clip_id}/preview")
async def api_manual_track_preview(clip_id: str, body: dict, request: Request,
                                   authorization: str | None = Header(None)):
    """PRATINJAU subjek manual tracking (tanpa menyimpan).

    Body: {"scene_start","scene_end","cx","cy","t_ref"} → balik kotak subjek
    per frame ({boxes:[{cx,cy,w}|None]}) supaya UI menggambar border yang
    mengikuti subjek di video sebelum user mengunci.
    """
    user = await get_user(request, authorization)
    ensure_uuid(clip_id, "Klip")
    from anyio import to_thread

    from . import render as render_mod
    from .manual_track import pratinjau_manual_track
    from .render_clip import _source_seek_url
    try:
        return await pratinjau_manual_track(
            clip_id, str(user["id"]), body or {},
            render_mod=render_mod, source_url_for=_source_seek_url,
            run_sync=to_thread.run_sync)
    except Exception as exc:
        print(f"[manual-track-preview] gagal: {exc}")
        raise HTTPException(400, str(exc)[:200])


@app.patch("/api/clips/{clip_id}/words")
async def api_edit_transcript(clip_id: str, body: dict, request: Request,
                              authorization: str | None = Header(None)):
    """EDIT TRANSKRIP — perbaiki kata yang salah baca STT.

    Body: {"words": [{"word": "teks baru", "start": s, "end": e}, ...]}
    — array BARU menggantikan seluruh caption_words (klien editor
    mengirim versi lengkap hasil edit; start/end per kata WAJIB tetap
    supaya karaoke tetap sinkron). Preview tidak direset: subtitle
    digambar LIVE di browser dari words ini, dan render unduhan memakai
    caption_words yang sama — keduanya otomatis konsisten.
    """
    user = await get_user(request, authorization)
    ensure_uuid(clip_id, "Klip")
    words = (body or {}).get("words")
    if not isinstance(words, list) or not words:
        raise HTTPException(400, "words wajib array tidak kosong")
    bersih: list[dict] = []
    for w in words:
        if not isinstance(w, dict):
            continue
        teks = str(w.get("word", "")).strip()
        if not teks:
            continue
        try:
            s = float(w.get("start", 0) or 0)
            e = float(w.get("end", s) or s)
        except (TypeError, ValueError):
            continue
        if e < s:
            s, e = e, s
        bersih.append({"word": teks[:80], "start": s, "end": e})
    if not bersih:
        raise HTTPException(400, "tidak ada kata valid")
    import httpx as _httpx
    try:
        async with _httpx.AsyncClient(timeout=15) as c:
            r = await c.get(
                f"{SUPABASE_URL}/rest/v1/clips?id=eq.{clip_id}"
                "&select=id,user_id",
                headers={"apikey": SUPABASE_SERVICE_KEY,
                         "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"})
            rows = r.json() if r.status_code == 200 else []
            if not rows or str(rows[0].get("user_id")) != str(user["id"]):
                raise RuntimeError("klip tidak ditemukan")
            async with _httpx.AsyncClient(timeout=15) as c2:
                await c2.patch(
                    f"{SUPABASE_URL}/rest/v1/clips?id=eq.{clip_id}",
                    headers={"apikey": SUPABASE_SERVICE_KEY,
                             "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                             "Content-Type": "application/json"},
                    json={"caption_words": bersih})
        return {"ok": True, "count": len(bersih)}
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[edit-transkrip] gagal: {exc}")
        raise HTTPException(400, str(exc)[:200])


@app.put("/api/editor-prefs/{clip_id}")
async def api_editor_prefs_put(clip_id: str, body: dict, request: Request,
                               authorization: str | None = Header(None)):
    """SIMPAN pengaturan editor ke SERVER (bukan localStorage saja).

    Permintaan pengguna: "semua proses user di editor — pengaturan subtitle,
    ikon, tracking, custom logo, edit transkrip — tersimpan langsung di
    server; kalau user keluar dari editor, semuanya masih kesimpan dan gak
    perlu diatur ulang". Body = prefs JSON apa adanya.
    """
    user = await get_user(request, authorization)
    ensure_uuid(clip_id, "Klip")
    import httpx as _httpx
    try:
        async with _httpx.AsyncClient(timeout=15) as c:
            r = await c.get(
                f"{SUPABASE_URL}/rest/v1/clips?id=eq.{clip_id}&select=id,user_id",
                headers={"apikey": SUPABASE_SERVICE_KEY,
                         "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"})
            rows = r.json() if r.status_code == 200 else []
            if not rows or str(rows[0].get("user_id")) != str(user["id"]):
                raise RuntimeError("klip tidak ditemukan")
            async with _httpx.AsyncClient(timeout=15) as c2:
                await c2.patch(
                    f"{SUPABASE_URL}/rest/v1/clips?id=eq.{clip_id}",
                    headers={"apikey": SUPABASE_SERVICE_KEY,
                             "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                             "Content-Type": "application/json"},
                    json={"editor_prefs": body or {}})
        return {"ok": True}
    except Exception as exc:
        print(f"[editor-prefs] gagal simpan: {exc}")
        raise HTTPException(400, str(exc)[:200])


@app.get("/api/editor-prefs/{clip_id}")
async def api_editor_prefs_get(clip_id: str, request: Request,
                               authorization: str | None = Header(None)):
    """Muat pengaturan editor tersimpan milik klip ini."""
    user = await get_user(request, authorization)
    ensure_uuid(clip_id, "Klip")
    import httpx as _httpx
    try:
        async with _httpx.AsyncClient(timeout=15) as c:
            r = await c.get(
                f"{SUPABASE_URL}/rest/v1/clips?id=eq.{clip_id}"
                "&select=id,user_id,editor_prefs",
                headers={"apikey": SUPABASE_SERVICE_KEY,
                         "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"})
        rows = r.json() if r.status_code == 200 else []
        if not rows or str(rows[0].get("user_id")) != str(user["id"]):
            raise RuntimeError("klip tidak ditemukan")
        return {"prefs": rows[0].get("editor_prefs") or {}}
    except Exception as exc:
        print(f"[editor-prefs] gagal muat: {exc}")
        raise HTTPException(400, str(exc)[:200])


@app.post("/api/logo/removebg")
async def api_logo_removebg(request: Request,
                            authorization: str | None = Header(None)):
    """Hapus background logo — v1 → gagal → v2 (failover berantai).

    Multipart: file gambar. Balik PNG hasil (Content-Type image/png).
    Fitur logo penuh premium, tapi removebg dibiarkan untuk semua supaya
    pengguna free bisa MELIHAT hasilnya dulu (gating ada di tombol Setuju).
    """
    user = await get_user(request, authorization)
    from .custom_logo import removebg
    try:
        form = await request.form()
        up = form.get("file")
        if up is None or not hasattr(up, "read"):
            raise HTTPException(400, "file wajib diunggah")
        data = await up.read()
        if len(data) > 25 * 1024 * 1024:
            raise HTTPException(400, "gambar maksimal 25 MB")
        png, versi = await removebg(data, os.getenv("NEXRAY_API_KEY", ""))
        from fastapi.responses import Response
        return Response(
            content=png, media_type="image/png",
            headers={"X-Removebg-Version": versi})
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[logo-removebg] gagal: {exc}")
        raise HTTPException(400, str(exc)[:200])


@app.post("/api/logo/{clip_id}")
async def api_logo_set(clip_id: str, body: dict, request: Request,
                        authorization: str | None = Header(None)):
    """Simpan logo klip (URL + posisi + skala). KHUSUS PREMIUM.

    Body: {"png_b64": "...", "cx": 0..1, "cy": 0..1, "scale": 0.05..1}
    — png_b64 = PNG hasil removebg (atau gambar asli) dari klien.
    """
    user = await get_user(request, authorization)
    ensure_uuid(clip_id, "Klip")
    import base64

    from .custom_logo import premium_aktif, set_logo_klip, simpan_logo
    try:
        if not await premium_aktif(str(user["id"])):
            raise HTTPException(402, "Custom logo hanya untuk pengguna Premium")
        body = body or {}
        b64 = str(body.get("png_b64", "")).split(",", 1)[-1]
        if not b64:
            raise HTTPException(400, "png_b64 wajib diisi")
        png = base64.b64decode(b64, validate=False)
        if len(png) < 100:
            raise HTTPException(400, "gambar tidak valid")
        url = await simpan_logo(clip_id, str(user["id"]), png)
        hasil = await set_logo_klip(
            clip_id, str(user["id"]), url,
            float(body.get("cx", 0.87) or 0.87),
            float(body.get("cy", 0.05) or 0.05),
            float(body.get("scale", 0.18) or 0.18))
        return hasil
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[logo-set] gagal: {exc}")
        raise HTTPException(400, str(exc)[:200])


@app.patch("/api/logo/{clip_id}/pos")
async def api_logo_pos(clip_id: str, body: dict, request: Request,
                       authorization: str | None = Header(None)):
    """Update posisi/skala logo (dipakai drag di preview) — tanpa re-upload.

    Body: {"cx": 0..1, "cy": 0..1, "scale": 0.05..1}. KHUSUS PREMIUM.
    """
    user = await get_user(request, authorization)
    ensure_uuid(clip_id, "Klip")
    from .custom_logo import premium_aktif, set_logo_klip
    try:
        if not await premium_aktif(str(user["id"])):
            raise HTTPException(402, "Custom logo hanya untuk pengguna Premium")
        import httpx as _httpx
        async with _httpx.AsyncClient(timeout=15) as c:
            r = await c.get(
                f"{SUPABASE_URL}/rest/v1/clips?id=eq.{clip_id}"
                "&select=id,user_id,camera_track",
                headers={"apikey": SUPABASE_SERVICE_KEY,
                         "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"})
        rows = r.json() if r.status_code == 200 else []
        if not rows or str(rows[0].get("user_id")) != str(user["id"]):
            raise RuntimeError("klip tidak ditemukan")
        ct = rows[0].get("camera_track") or {}
        logo = (ct.get("logo") or {}) if isinstance(ct, dict) else {}
        if not logo.get("url"):
            raise HTTPException(400, "belum ada logo — unggah dulu")
        return await set_logo_klip(
            clip_id, str(user["id"]), str(logo["url"]),
            float((body or {}).get("cx", logo.get("cx", 0.87))),
            float((body or {}).get("cy", logo.get("cy", 0.05))),
            float((body or {}).get("scale", logo.get("scale", 0.18))))
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[logo-pos] gagal: {exc}")
        raise HTTPException(400, str(exc)[:200])


@app.delete("/api/logo/{clip_id}")
async def api_logo_delete(clip_id: str, request: Request,
                          authorization: str | None = Header(None)):
    """Hapus logo dari klip."""
    user = await get_user(request, authorization)
    ensure_uuid(clip_id, "Klip")
    from .custom_logo import hapus_logo
    try:
        return await hapus_logo(clip_id, str(user["id"]))
    except Exception as exc:
        print(f"[logo-del] gagal: {exc}")
        raise HTTPException(400, str(exc)[:200])


@app.post("/api/clips/{clip_id}/thumbnail")
async def api_clip_thumbnail(clip_id: str, request: Request,
                             refresh: bool = False,
                             authorization: str | None = Header(None)):
    """Thumbnail (gambar potongan) klip ini — dibuat sekali lalu di-cache.

    Kartu klip di halaman proyek memakai gambar ini, bukan angka skor di
    kotak polos. Frame diambil lewat ffmpeg HTTP-range (tidak mengunduh
    video penuh) dan di-crop mengikuti jalur kamera face tracking yang sudah
    tersimpan, jadi wajahnya masuk bingkai.
    """
    user = await get_user(request, authorization)
    ensure_uuid(clip_id, "Klip")
    from .clip_thumb import pastikan_thumb
    from .render_clip import _source_seek_url
    try:
        return await pastikan_thumb(clip_id, str(user["id"]),
                                    source_url_for=_source_seek_url,
                                    paksa=bool(refresh))
    except Exception as exc:
        print(f"[thumb] gagal {clip_id}: {exc}")
        raise HTTPException(400, str(exc)[:200])


@app.post("/api/projects/{project_id}/thumbnails")
async def api_project_thumbnails(project_id: str, request: Request,
                                 authorization: str | None = Header(None)):
    """Buat thumbnail untuk SEMUA klip proyek yang belum punya (latar belakang).

    Dipanggil sekali saat halaman proyek dibuka; klien tidak perlu menunggu.
    Dibatasi 12 klip per panggilan supaya tidak memborong CPU render.
    """
    user = await get_user(request, authorization)
    ensure_uuid(project_id, "Proyek")
    from .clip_thumb import pastikan_thumb
    from .render_clip import _source_seek_url
    from .background import spawn

    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(
            f"{SUPABASE_URL}/rest/v1/clips?project_id=eq.{project_id}"
            "&thumb_url=is.null&select=id&limit=12",
            headers={"apikey": SUPABASE_SERVICE_KEY,
                     "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"})
    ids = [str(row["id"]) for row in (r.json() if r.status_code == 200 else [])]
    if not ids:
        return {"ok": True, "queued": 0}

    async def _kerjakan() -> None:
        for cid in ids:
            try:
                await pastikan_thumb(cid, str(user["id"]),
                                     source_url_for=_source_seek_url)
            except Exception as exc:
                print(f"[thumb] batch {cid[:8]} gagal: {exc}")

    # background.spawn WAJIB (bukan asyncio.create_task): task tanpa referensi
    # bisa dibuang garbage collector di tengah jalan.
    spawn(_kerjakan(), name=f"thumbs:{project_id}", key=f"thumbs:{project_id}")
    return {"ok": True, "queued": len(ids)}


@app.post("/api/projects/{project_id}/banner")
async def api_project_banner(project_id: str, request: Request,
                            authorization: str | None = Header(None)):
    """BANNER PROJECT (permintaan pengguna): sistem otomatis mengambil
    screenshot dari salah satu klip proyek untuk dipakai sebagai banner
    background kartu proyek di dashboard.

    Pakai klip pertama yang punya thumb_url; kalau belum ada, antre
    pastikan_thumb untuk klip pertama (background). Idempoten: kalau
    banner_url sudah ada, langsung balik.
    """
    user = await get_user(request, authorization)
    ensure_uuid(project_id, "Proyek")
    from .clip_thumb import pastikan_thumb
    from .render_clip import _source_seek_url
    from .background import spawn

    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(
            f"{SUPABASE_URL}/rest/v1/projects?id=eq.{project_id}"
            "&select=id,user_id,banner_url",
            headers={"apikey": SUPABASE_SERVICE_KEY,
                     "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"})
    rows = r.json() if r.status_code == 200 else []
    if not rows or str(rows[0].get("user_id")) != str(user["id"]):
        raise HTTPException(404, "proyek tidak ditemukan")
    if rows[0].get("banner_url"):
        return {"ok": True, "url": rows[0]["banner_url"], "cached": True}

    # cari thumb yang sudah ada
    async with httpx.AsyncClient(timeout=30) as client:
        r2 = await client.get(
            f"{SUPABASE_URL}/rest/v1/clips?project_id=eq.{project_id}"
            "&select=id,thumb_url&order=created_at.asc&limit=3",
            headers={"apikey": SUPABASE_SERVICE_KEY,
                     "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"})
    klips = r2.json() if r2.status_code == 200 else []
    kandidat = next((k["thumb_url"] for k in klips if k.get("thumb_url")), None)

    if kandidat:
        async with httpx.AsyncClient(timeout=30) as client:
            await client.patch(
                f"{SUPABASE_URL}/rest/v1/projects?id=eq.{project_id}",
                headers={"apikey": SUPABASE_SERVICE_KEY,
                         "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                         "Content-Type": "application/json"},
                json={"banner_url": kandidat})
        return {"ok": True, "url": kandidat, "cached": False}

    # belum ada thumb → buat satu di background
    if klips:
        async def _kerjakan() -> None:
            try:
                d = await pastikan_thumb(str(klips[0]["id"]), str(user["id"]),
                                         source_url_for=_source_seek_url)
                if d.get("url"):
                    async with httpx.AsyncClient(timeout=30) as c:
                        await c.patch(
                            f"{SUPABASE_URL}/rest/v1/projects?id=eq.{project_id}",
                            headers={"apikey": SUPABASE_SERVICE_KEY,
                                     "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                                     "Content-Type": "application/json"},
                            json={"banner_url": d["url"]})
            except Exception as exc:
                print(f"[banner] {project_id[:8]} gagal: {exc}")
        spawn(_kerjakan(), name=f"banner:{project_id}", key=f"banner:{project_id}")
    return {"ok": True, "url": None, "queued": True}


@app.get("/api/preview-clip/status/{clip_id}")
async def api_preview_status(clip_id: str, request: Request,
                             authorization: str | None = Header(None)):
    """Status preview: processing | ready | idle (+ url kalau sudah siap).

    Menyertakan `progress` (0-100) dan `stage` supaya UI bisa menampilkan
    "Memuat preview 42%" alih-alih layar hitam tanpa keterangan.
    """
    await get_user(request, authorization)
    ensure_uuid(clip_id, "Klip")
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(
            f"{SUPABASE_URL}/rest/v1/clips?id=eq.{clip_id}"
            "&select=preview_url,preview_ready",
            headers={"apikey": SUPABASE_SERVICE_KEY,
                     "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"},
        )
    rows = r.json() if r.status_code == 200 else []
    row = rows[0] if rows else {}
    from .preview_progress import get_progress
    prog = get_progress(clip_id) or {}
    if row.get("preview_ready") and row.get("preview_url"):
        return {"status": "ready", "url": row["preview_url"],
                "progress": 100, "stage": "Selesai"}
    key = f"preview:{clip_id}"
    from .background import sedang_jalan
    running = sedang_jalan(key)
    if not running:
        # kegagalan nyata dilaporkan apa adanya supaya klien BERHENTI mengulang
        from .preview_progress import ambil_gagal
        info = ambil_gagal(clip_id)
        if info:
            return {"status": "failed", "url": None, "progress": 0,
                    "stage": info["pesan"], "eta_s": None, "elapsed_s": 0}
    return {"status": "processing" if running else "idle", "url": None,
            "progress": int(prog.get("pct", 0)),
            "stage": prog.get("tahap") or ("Menyiapkan" if running else ""),
            # estimasi sisa detik dari laju NYATA (lihat preview_progress.py) —
            # dipakai UI untuk hitung mundur; None kalau belum bisa dihitung
            "eta_s": prog.get("eta_s"),
            "elapsed_s": prog.get("elapsed_s", 0)}


# ---------------------------------------------------------------------------
# Render jobs background (Unduh async — boleh keluar halaman)
# ---------------------------------------------------------------------------

class RenderJobIn(BaseModel):
    project_id: str
    clip_id: str
    clip_title: Optional[str] = None
    caption_style: Optional[dict[str, Any]] = None


@app.post("/api/render-jobs")
async def api_start_render_job(body: RenderJobIn, request: Request, authorization: str | None = Header(None)):
    """Mulai render klip di BACKGROUND. User boleh keluar/pindah tab —
    hasilnya diambil lewat GET /api/render-jobs (halaman /unduh)."""
    user = await get_user(request, authorization)
    ensure_uuid(body.project_id)
    ensure_uuid(body.clip_id, "Klip")
    token = authorization.split(" ", 1)[1] if authorization and " " in authorization else ""

    # Resource guard — tolak job yang bikin server kritis
    from .limits import can_accept_render
    ok, reason = can_accept_render(user["id"])
    if not ok:
        raise HTTPException(429, reason)

    # Judul klip: dipakai untuk NAMA FILE unduhan (tiap klip beda nama).
    # Kalau klien tidak mengirim, ambil dari DB supaya tidak pernah kosong.
    clip_title = (body.clip_title or "").strip()
    if not clip_title:
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                cr = await client.get(
                    f"{SUPABASE_URL}/rest/v1/clips?id=eq.{body.clip_id}&select=title",
                    headers={"apikey": SUPABASE_SERVICE_KEY,
                             "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"},
                )
            rows = cr.json() if cr.status_code == 200 else []
            clip_title = str((rows[0] if rows else {}).get("title") or "").strip()
        except Exception as exc:
            print(f"[render-jobs] ambil judul klip gagal: {exc}")

    # simpan job ke DB
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            f"{SUPABASE_URL}/rest/v1/render_jobs",
            headers={
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "return=representation",
            },
            json={
                "user_id": user["id"],
                "project_id": body.project_id,
                "clip_id": body.clip_id,
                "clip_title": clip_title or None,
                "status": "pending",
                "caption_style": body.caption_style or {},
            },
        )
        if r.status_code not in (200, 201):
            raise HTTPException(500, f"Gagal membuat job render: {r.text[:200]}")
        job = r.json()[0]

    # jalankan render di background — pakai to_thread supaya subprocess
    # blocking (ffmpeg) TIDAK menahan event loop (API tetap responsif)
    async def run_job():
        from .render_clip import render_clip_server
        import anyio
        try:
            async with httpx.AsyncClient(timeout=15) as c:
                await c.patch(
                    f"{SUPABASE_URL}/rest/v1/render_jobs?id=eq.{job['id']}",
                    headers={"apikey": SUPABASE_SERVICE_KEY,
                             "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                             "Content-Type": "application/json"},
                    json={"status": "rendering"},
                )
            def _render_blocking():
                # thread baru + event loop baru — ffmpeg blocking tidak
                # menahan event loop utama (API tetap responsif).
                # RenderSlot = queue otomatis: max N render concurrent,
                # sisanya menunggu sampai slot bebas (server gak down).
                from .limits import RenderSlot
                with RenderSlot(job["id"], user["id"]):
                    return asyncio.run(
                        render_clip_server(
                            body.project_id, body.clip_id, token=token,
                            caption_style=body.caption_style,
                            resolution="720x1280",   # 720p sesuai permintaan user
                            face_tracking=True,
                        )
                    )

            result = await anyio.to_thread.run_sync(_render_blocking)
            async with httpx.AsyncClient(timeout=15) as c:
                await c.patch(
                    f"{SUPABASE_URL}/rest/v1/render_jobs?id=eq.{job['id']}",
                    headers={"apikey": SUPABASE_SERVICE_KEY,
                             "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                             "Content-Type": "application/json"},
                    json={"status": "completed", "rendered_url": result["url"],
                          "completed_at": "now()"},
                )
        except Exception as exc:
            async with httpx.AsyncClient(timeout=15) as c:
                await c.patch(
                    f"{SUPABASE_URL}/rest/v1/render_jobs?id=eq.{job['id']}",
                    headers={"apikey": SUPABASE_SERVICE_KEY,
                             "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                             "Content-Type": "application/json"},
                    json={"status": "failed", "error": str(exc)[:500]},
                )

    from .background import spawn
    spawn(run_job(), name=f"render:{job['id'][:8]}",
          key=f"render-job:{job['id']}")
    return {"job_id": job["id"], "status": "pending"}


@app.get("/api/render-jobs")
async def api_list_render_jobs(request: Request, authorization: str | None = Header(None)):
    """Daftar job render user (terbaru dulu) — dipakai halaman /unduh."""
    user = await get_user(request, authorization)
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(
            f"{SUPABASE_URL}/rest/v1/render_jobs?user_id=eq.{user['id']}"
            f"&select=id,project_id,clip_id,clip_title,status,rendered_url,error,created_at,completed_at"
            f"&order=created_at.desc&limit=50",
            headers={"apikey": SUPABASE_SERVICE_KEY,
                     "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"},
        )
    return {"jobs": r.json()}


@app.get("/api/render-jobs/queue")
async def api_render_queue(request: Request, authorization: Optional[str] = Header(None)):
    """Posisi antrean render — dipakai editor sebelum menekan Unduh."""
    await get_user(request, authorization)
    from .limits import resource_status
    st = resource_status()
    return {
        "total_active": int(st.get("active_renders", 0)),
        "max_concurrent": int(st.get("max_concurrent_renders", 2)),
    }


@app.get("/api/render-jobs/{job_id}")
async def api_get_render_job(job_id: str, request: Request,
                            authorization: str | None = Header(None)):
    """Status satu job unduhan (dipakai halaman unduh & pemantau eksternal)."""
    user = await get_user(request, authorization)
    ensure_uuid(job_id, "Job")
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(
            f"{SUPABASE_URL}/rest/v1/render_jobs?id=eq.{job_id}"
            f"&user_id=eq.{user['id']}"
            "&select=id,status,rendered_url,error,clip_title,created_at,completed_at",
            headers={"apikey": SUPABASE_SERVICE_KEY,
                     "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"},
        )
    rows = r.json() if r.status_code == 200 else []
    if not rows:
        raise HTTPException(404, "Job tidak ditemukan")
    row = rows[0]
    # alias supaya klien lama/baru sama-sama jalan
    row["url"] = row.get("rendered_url")
    row["output_url"] = row.get("rendered_url")
    return row


@app.delete("/api/render-jobs/{job_id}")
async def api_delete_render_job(job_id: str, request: Request, authorization: Optional[str] = Header(None)):
    """Hapus satu job unduhan (row render_jobs milik user)."""
    user = await get_user(request, authorization)
    ensure_uuid(job_id, "Job")
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.delete(
            f"{SUPABASE_URL}/rest/v1/render_jobs?id=eq.{job_id}&user_id=eq.{user['id']}",
            headers={"apikey": SUPABASE_SERVICE_KEY,
                     "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"},
        )
    if r.status_code >= 300:
        raise HTTPException(400, "Gagal menghapus unduhan")
    return {"ok": True}


@app.get("/api/render-jobs/project/{project_id}")
async def api_project_render_jobs(project_id: str, request: Request, authorization: str | None = Header(None)):
    """Job render untuk satu project — dipakai deteksi 'render selesai' saat balik ke halaman project."""
    user = await get_user(request, authorization)
    ensure_uuid(project_id)
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(
            f"{SUPABASE_URL}/rest/v1/render_jobs?user_id=eq.{user['id']}&project_id=eq.{project_id}"
            f"&select=id,clip_id,clip_title,status,rendered_url,created_at"
            f"&order=created_at.desc&limit=20",
            headers={"apikey": SUPABASE_SERVICE_KEY,
                     "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"},
        )
    if r.status_code >= 300:
        print(f"[render-jobs] query project gagal: {r.status_code} {r.text[:120]}")
        return {"jobs": []}
    data = r.json()
    return {"jobs": data if isinstance(data, list) else []}


# ---------------------------------------------------------------------------
# Ads & watermark (hapus watermark = tonton 4 iklan)
# ---------------------------------------------------------------------------

@app.post("/api/ads/watched")
async def api_ad_watched(request: Request, authorization: str | None = Header(None)):
    """Tandai satu iklan selesai ditonton. Setelah 4x → watermark_removed=true
    (render berikutnya tanpa watermark)."""
    user = await get_user(request, authorization)
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(
            f"{SUPABASE_URL}/rest/v1/profiles?user_id=eq.{user['id']}&select=ads_watched,watermark_removed",
            headers={"apikey": SUPABASE_SERVICE_KEY,
                     "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"},
        )
        rows = r.json() if r.status_code == 200 else []
        watched = int(rows[0].get("ads_watched") or 0) if rows else 0
        removed = bool(rows[0].get("watermark_removed")) if rows else False
        watched += 1
        if watched >= 4:
            removed = True
        await client.patch(
            f"{SUPABASE_URL}/rest/v1/profiles?user_id=eq.{user['id']}",
            headers={"apikey": SUPABASE_SERVICE_KEY,
                     "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                     "Content-Type": "application/json"},
            json={"ads_watched": watched, "watermark_removed": removed},
        )
    remaining = max(0, 4 - watched)
    return {
        "ads_watched": watched,
        "watermark_removed": removed,
        "remaining": remaining,
        "message": "Watermark dihapus! Render berikutnya bebas watermark." if removed
                   else f"Iklan {watched}/4 ditonton — {remaining} lagi untuk hapus watermark.",
    }


@app.get("/api/ads/status")
async def api_ads_status(request: Request, authorization: str | None = Header(None)):
    """Status iklan & watermark user."""
    user = await get_user(request, authorization)
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(
            f"{SUPABASE_URL}/rest/v1/profiles?user_id=eq.{user['id']}"
            "&select=ads_watched,watermark_removed,ad_credits,ad_target,premium_until",
            headers={"apikey": SUPABASE_SERVICE_KEY,
                     "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"},
        )
        rows = r.json() if r.status_code == 200 else []
    prof = rows[0] if rows else {}
    watched = int(prof.get("ads_watched") or 0)
    # Cek apakah user premium aktif: jika premium, watermark otomatis bebas (removed = True)
    is_prem = False
    pu = prof.get("premium_until")
    if pu:
        try:
            from datetime import datetime, timezone
            is_prem = datetime.fromisoformat(pu.replace("Z", "+00:00")) > datetime.now(timezone.utc)
        except Exception:
            is_prem = False

    removed = is_prem or bool(prof.get("watermark_removed")) or watched >= 4
    from .ad_premium import summary as ad_summary
    return {"ads_watched": watched, "watermark_removed": removed,
            "remaining": 0 if removed else max(0, 4 - watched),
            "premium_until": prof.get("premium_until"),
            "ad_premium": ad_summary(prof)}


# ---- Premium lewat menonton iklan ------------------------------------------

class AdPlanIn(BaseModel):
    plan: str          # day | week | month


class FreePremiumStateIn(BaseModel):
    status: str        # open | closed | hidden


@app.get("/api/ads/premium")
async def api_ad_premium_status(request: Request,
                                authorization: str | None = Header(None)):
    """Progres iklan user + daftar paket (dipakai dialog premium)."""
    user = await get_user(request, authorization)
    from .ad_premium import summary as ad_summary
    from .premium import sb
    rows = await sb("GET", f"profiles?user_id=eq.{user['id']}"
                           "&select=ad_credits,ad_target,premium_until")
    prof = (rows or [{}])[0]
    out = ad_summary(prof)
    out["premium_until"] = prof.get("premium_until")
    return out


@app.post("/api/ads/premium/watch")
async def api_ad_premium_watch(body: AdPlanIn, request: Request,
                               authorization: str | None = Header(None)):
    """Catat SATU iklan selesai ditonton untuk paket premium tertentu."""
    from .free_premium_config import get_free_premium_status
    st = get_free_premium_status()
    if st in ("closed", "hidden"):
        raise HTTPException(400, "Maaf, premium gratis sedang ada kendala.")

    user = await get_user(request, authorization)
    from .ad_redeem import record_watch
    from .premium import sb
    try:
        return await record_watch(user["id"], body.plan, sb)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@app.post("/api/ads/premium/redeem")
async def api_ad_premium_redeem(body: AdPlanIn, request: Request,
                                authorization: str | None = Header(None)):
    """Tukar kredit iklan menjadi premium (watermark hilang selama aktif)."""
    from .free_premium_config import get_free_premium_status
    st = get_free_premium_status()
    if st in ("closed", "hidden"):
        raise HTTPException(400, "Maaf, premium gratis sedang ada kendala.")

    user = await get_user(request, authorization)
    from .ad_redeem import redeem
    from .premium import sb
    try:
        hasil = await redeem(user["id"], body.plan, sb)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    if not hasil.get("ok"):
        raise HTTPException(400, hasil.get("reason") or "gagal menukar")
    return hasil


# ---- Admin: Pengaturan Status Free Premium (Iklan) -------------------------

@app.get("/api/admin/free-premium")
async def api_admin_get_free_premium(request: Request, authorization: str | None = Header(None)):
    await require_admin_user(request, authorization)
    from .free_premium_config import get_free_premium_status
    return {"status": get_free_premium_status()}


@app.post("/api/admin/free-premium")
async def api_admin_set_free_premium(body: FreePremiumStateIn, request: Request, authorization: str | None = Header(None)):
    me = await require_admin_user(request, authorization)
    from .free_premium_config import set_free_premium_status
    from .admin_logs import log_system
    try:
        st = set_free_premium_status(body.status)
        log_system("Admin Action", f"Free premium status diubah menjadi: {st.upper()}", user=me["email"], level="WARN")
        return {"ok": True, "status": st}
    except ValueError as exc:
        raise HTTPException(400, str(exc))


# ---- SISTEM REFERRAL (Komisi & Kuota Tiket Unduh) --------------------------

@app.get("/api/referral/my-code")
async def api_referral_my_code(request: Request, authorization: str | None = Header(None)):
    """Ambil kode referral, jumlah teman yang diundang, dan tiket bonus."""
    user = await get_user(request, authorization)
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(
            f"{SUPABASE_URL}/rest/v1/profiles?user_id=eq.{user['id']}"
            "&select=referral_code,referral_count,bonus_credits,referred_by",
            headers={"apikey": SUPABASE_SERVICE_KEY, "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"},
        )
        rows = r.json() if r.status_code == 200 else []
    if not rows:
        raise HTTPException(404, "Profil tidak ditemukan")
    prof = rows[0]
    code = prof.get("referral_code") or str(user["id"])[:8].lower()
    return {
        "referral_code": code,
        "referral_count": int(prof.get("referral_count") or 0),
        "bonus_credits": int(prof.get("bonus_credits") or 0),
        "referred_by": prof.get("referred_by"),
        "share_url": f"https://cortexclip.eu.cc/auth?ref={code}",
        "reward_info": "1 Tiket Bebas Watermark untukmu setiap 1 teman yang mendaftar!",
    }


class ReferralClaimIn(BaseModel):
    code: str


@app.post("/api/referral/claim")
async def api_referral_claim(body: ReferralClaimIn, request: Request, authorization: str | None = Header(None)):
    """Klaim kode referral oleh pengguna baru (hanya bisa 1x klaim)."""
    user = await get_user(request, authorization)
    code = body.code.strip().lower()
    if not code:
        raise HTTPException(400, "Kode referral tidak valid")

    async with httpx.AsyncClient(timeout=15) as client:
        r_me = await client.get(
            f"{SUPABASE_URL}/rest/v1/profiles?user_id=eq.{user['id']}&select=referral_code,referred_by,bonus_credits",
            headers={"apikey": SUPABASE_SERVICE_KEY, "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"},
        )
        me_rows = r_me.json() if r_me.status_code == 200 else []
        if not me_rows:
            raise HTTPException(404, "Profil tidak ditemukan")
        me = me_rows[0]
        if me.get("referred_by"):
            raise HTTPException(400, "Kamu sudah pernah mengklaim kode referral sebelumnya.")
        if (me.get("referral_code") or "").lower() == code:
            raise HTTPException(400, "Tidak dapat menggunakan kode referral milik sendiri.")

        r_ref = await client.get(
            f"{SUPABASE_URL}/rest/v1/profiles?referral_code=eq.{code}&select=user_id,referral_count,bonus_credits",
            headers={"apikey": SUPABASE_SERVICE_KEY, "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"},
        )
        ref_rows = r_ref.json() if r_ref.status_code == 200 else []
        if not ref_rows:
            raise HTTPException(404, "Kode referral tidak ditemukan")
        referrer = ref_rows[0]

        new_ref_count = int(referrer.get("referral_count") or 0) + 1
        new_ref_bonus = int(referrer.get("bonus_credits") or 0) + 1
        await client.patch(
            f"{SUPABASE_URL}/rest/v1/profiles?user_id=eq.{referrer['user_id']}",
            headers={"apikey": SUPABASE_SERVICE_KEY, "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"},
            json={"referral_count": new_ref_count, "bonus_credits": new_ref_bonus},
        )

        new_my_bonus = int(me.get("bonus_credits") or 0) + 1
        await client.patch(
            f"{SUPABASE_URL}/rest/v1/profiles?user_id=eq.{user['id']}",
            headers={"apikey": SUPABASE_SERVICE_KEY, "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"},
            json={"referred_by": code, "bonus_credits": new_my_bonus},
        )

    return {
        "success": True,
        "message": "Selamat! Kode referral berhasil diklaim. Kamu mendapatkan 1 tiket render bebas watermark!",
        "bonus_credits": new_my_bonus,
    }


# ---- Admin: Real-Time System & AI Logs ------------------------------------

@app.get("/api/admin/logs/system")
async def api_admin_get_system_logs(request: Request, authorization: str | None = Header(None), limit: int = 100):
    await require_admin_user(request, authorization)
    from .admin_logs import get_system_logs
    from .limits import resource_status
    return {
        "logs": get_system_logs(min(limit, 200)),
        "resources": resource_status(),
        "timestamp": time.time()
    }


@app.get("/api/admin/logs/ai")
async def api_admin_get_ai_logs(request: Request, authorization: str | None = Header(None), limit: int = 100):
    await require_admin_user(request, authorization)
    from .admin_logs import get_ai_logs
    from .hydra import gateway
    return {
        "logs": get_ai_logs(min(limit, 200)),
        "models_status": gateway.status(),
        "timestamp": time.time()
    }


class FrontendErrorIn(BaseModel):
    source: str
    message: str
    stack: str | None = ""


@app.post("/api/logs/error")
async def api_report_frontend_error(body: FrontendErrorIn, request: Request):
    """Terima laporan error dari frontend/browser & catat ke admin log."""
    from .admin_logs import log_error
    ip = request.headers.get("x-forwarded-for", "") or (request.client.host if request.client else "")
    log_error(body.source or "Frontend", body.message, stack=body.stack or "", user="browser", ip=ip)
    return {"ok": True}


@app.get("/api/admin/logs/export")
async def api_admin_export_logs(
    request: Request,
    kind: str = "all",      # all | ai | error
    fmt: str = "json",      # json | txt
    authorization: str | None = Header(None),
):
    """Unduh seluruh log sistem/AI/error sebagai file .json atau .txt."""
    await require_admin_user(request, authorization)
    from .admin_logs import export_logs_content
    from fastapi.responses import Response
    content, filename, media_type = export_logs_content(kind, fmt)
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# Hydra / admin
# ---------------------------------------------------------------------------

@app.get("/api/hydra/status")
async def hydra_status(request: Request, authorization: str | None = Header(None)):
    """Kesehatan endpoint AI + statistik sukses/gagal kumulatif per model.

    `katalog=1` mengembalikan SEMUA model yang dikenal, termasuk provider
    yang belum punya API key (ditandai configured=false) — dipakai panel
    admin supaya tidak ada model yang tersembunyi.
    """
    await require_admin_user(request, authorization)
    katalog = request.query_params.get("katalog") in ("1", "true", "yes")
    return {"endpoints": gateway.katalog() if katalog else gateway.status()}


# hasil uji model terakhir (diisi task latar, dibaca endpoint status)
_UJI_MODEL_STATE: dict[str, Any] = {"jalan": False, "hasil": None, "mulai": 0.0}

@app.post("/api/admin/uji-model")
async def api_admin_uji_model(request: Request, authorization: str | None = Header(None)):
    """Jalankan uji SEMUA model di LATAR BELAKANG. Balas seketika. (Hanya Owner)"""
    await require_owner_user(request, authorization)
    if _UJI_MODEL_STATE["jalan"]:
        return {"jalan": True, "sudah_berjalan": True}
    _UJI_MODEL_STATE.update(jalan=True, mulai=time.time(), hasil=None)

    async def _uji() -> None:
        try:
            _UJI_MODEL_STATE["hasil"] = await gateway.uji_semua()
        except Exception as exc:
            _UJI_MODEL_STATE["hasil"] = {"error": str(exc)[:300]}
        finally:
            _UJI_MODEL_STATE["jalan"] = False

    from .background import spawn
    spawn(_uji(), name="uji:model")
    return {"jalan": True}


@app.get("/api/admin/uji-model/status")
async def api_admin_uji_model_status(request: Request, authorization: str | None = Header(None)):
    """Status uji model latar belakang: jalan? hasil terakhir?"""
    await require_admin_user(request, authorization)
    return {
        "jalan": _UJI_MODEL_STATE["jalan"],
        "detik_berjalan": round(time.time() - _UJI_MODEL_STATE["mulai"], 1)
                           if _UJI_MODEL_STATE["jalan"] else None,
        "hasil": _UJI_MODEL_STATE["hasil"],
    }


@app.get("/api/admin/resources")
async def admin_resources(authorization: str | None = Header(None)):
    """Snapshot resource server + batasan aktif (monitoring admin)."""
    require_admin(authorization)
    from .limits import resource_status
    return resource_status()


@app.post("/api/admin/login")
async def admin_login(body: AdminLogin):
    if not ADMIN_PASSWORD:
        raise HTTPException(503, "Admin login belum dikonfigurasi di server")
    # constant-time-ish compare
    if not (secrets.compare_digest(body.username, ADMIN_USER)
            and secrets.compare_digest(body.password, ADMIN_PASSWORD)):
        raise HTTPException(401, "Username atau password salah")
    token = secrets.token_urlsafe(32)
    ADMIN_TOKENS[token] = time.time() + 12 * 3600
    return {"token": token, "expires_in": 12 * 3600}


@app.get("/api/admin/overview")
async def admin_overview(authorization: str = Header(None)):
    require_admin(authorization)
    now = time.time()
    live = [
        {k: v for k, v in j.items() if k not in ("segments", "transcript")}
        for j in jobs.values() if now - j.get("created", 0) < 86400
    ]
    return {
        "jobs": live,
        "hydra": gateway.status(),
        "output_dir": jobs_mod.OUTPUT_DIR,
    }


# ---------------------------------------------------------------------------
# Admin panel (login pakai akun Supabase yang profiles.is_admin = true)
# ---------------------------------------------------------------------------

OWNER_EMAIL = "admin@cortexclip.app"
OWNER_USER_ID = "d6a7ffe1-8168-4df4-848c-2ad4dac25835"

def is_owner_account(user: dict[str, Any]) -> bool:
    """Mengecek apakah akun adalah Owner / Superadmin utama (Iqbal)."""
    return (
        user.get("id") == OWNER_USER_ID or
        str(user.get("email", "")).strip().lower() == OWNER_EMAIL.lower()
    )

async def require_admin_user(request: Request, authorization: str | None = Header(None)) -> dict[str, Any]:
    """Verifikasi JWT user + pastikan dia admin. Return user dict."""
    from . import admin as admin_mod
    user = await get_user(request, authorization, check_ban=False)
    if not await admin_mod.is_admin(user["id"]):
        raise HTTPException(403, "Akses ditolak — akun ini bukan admin.")
    return user

async def require_owner_user(request: Request, authorization: str | None = Header(None)) -> dict[str, Any]:
    """Wajib akun Owner / Superadmin (Iqbal). Sub-admin ditolak (403)."""
    user = await require_admin_user(request, authorization)
    if not is_owner_account(user):
        raise HTTPException(403, "Akses ditolak: Aksi ini hanya dapat dilakukan oleh Owner (Iqbal).")
    return user


class BanIn(BaseModel):
    duration: str            # '1d' | '5d' | '1mo' | 'permanent'
    reason: Optional[str] = ""


class PlanIn(BaseModel):
    plan: str                # 'free' | 'day' | '5day' | 'month' | 'year'


class AdminFlagIn(BaseModel):
    is_admin: bool


class PricingUpdateIn(BaseModel):
    plans: dict[str, Any]


@app.get("/api/me/status")
async def api_me_status(request: Request, authorization: str | None = Header(None)):
    """Status akun untuk frontend: admin?, diban?, plan, kuota.

    Sengaja TIDAK memblokir user yang diban — halaman ban butuh endpoint ini.
    """
    from . import admin as admin_mod
    from .premium import quota_check_project
    user = await get_user(request, authorization, check_ban=False)
    ban = await admin_mod.ban_state(user["id"])
    quota = await quota_check_project(user["id"])
    await admin_mod.touch_seen(user["id"])
    return {
        "user": {"id": user["id"], "email": user["email"]},
        "is_admin": await admin_mod.is_admin(user["id"]),
        "is_owner": is_owner_account(user),
        "ban": ban,
        "quota": quota,
    }


@app.post("/api/me/login-event")
async def api_me_login_event(request: Request, authorization: str | None = Header(None)):
    from . import admin as admin_mod
    from .admin_logs import log_system
    user = await get_user(request, authorization, check_ban=False)
    ua = request.headers.get("user-agent", "")
    ip = request.headers.get("x-forwarded-for", "") or (request.client.host if request.client else "")
    await admin_mod.record_login(user["id"], ua, ip)
    log_system("User Activity", f"Pengguna aktif di platform (IP: {ip})", user=user["email"], ip=ip)
    return {"ok": True}


@app.get("/api/admin/stats")
async def api_admin_stats(request: Request, authorization: Optional[str] = Header(None)):
    from . import admin as admin_mod
    await require_admin_user(request, authorization)
    data = await admin_mod.overview()
    try:
        from .limits import resource_status
        data["resources"] = resource_status()
    except Exception:
        data["resources"] = {}
    data["ban_durations"] = [
        {"key": k, "label": v["label"]} for k, v in admin_mod.BAN_DURATIONS.items()
    ]
    return data


@app.get("/api/admin/users")
async def api_admin_users(request: Request, authorization: Optional[str] = Header(None),
                          search: str = "", limit: int = 100, offset: int = 0):
    from . import admin as admin_mod
    await require_admin_user(request, authorization)
    return await admin_mod.list_users(search=search, limit=min(limit, 300), offset=offset)


@app.get("/api/admin/users/{user_id}")
async def api_admin_user_detail(user_id: str, request: Request,
                                authorization: Optional[str] = Header(None)):
    from . import admin as admin_mod
    await require_admin_user(request, authorization)
    ensure_uuid(user_id, "User")
    try:
        return await admin_mod.user_detail(user_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))


@app.post("/api/admin/users/{user_id}/ban")
async def api_admin_ban(user_id: str, body: BanIn, request: Request,
                        authorization: str | None = Header(None)):
    from . import admin as admin_mod
    me = await require_owner_user(request, authorization)
    ensure_uuid(user_id, "User")
    if user_id == me["id"] or user_id == OWNER_USER_ID:
        raise HTTPException(403, "Akun Owner / Superadmin tidak dapat diban.")
    try:
        return await admin_mod.ban_user(me["id"], user_id, body.duration, body.reason or "")
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@app.post("/api/admin/users/{user_id}/unban")
async def api_admin_unban(user_id: str, request: Request,
                          authorization: str | None = Header(None)):
    from . import admin as admin_mod
    me = await require_owner_user(request, authorization)
    ensure_uuid(user_id, "User")
    return await admin_mod.unban_user(me["id"], user_id)


@app.post("/api/admin/users/{user_id}/plan")
async def api_admin_set_plan(user_id: str, body: PlanIn, request: Request,
                             authorization: str | None = Header(None)):
    from . import admin as admin_mod
    me = await require_owner_user(request, authorization)
    ensure_uuid(user_id, "User")
    if user_id == OWNER_USER_ID:
        raise HTTPException(403, "Plan akun Owner / Superadmin tidak dapat diubah.")
    try:
        return await admin_mod.set_plan(me["id"], user_id, body.plan)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@app.post("/api/admin/users/{user_id}/admin-flag")
async def api_admin_set_admin(user_id: str, body: AdminFlagIn, request: Request,
                              authorization: str | None = Header(None)):
    from . import admin as admin_mod
    me = await require_owner_user(request, authorization)
    ensure_uuid(user_id, "User")
    if user_id == OWNER_USER_ID:
        raise HTTPException(403, "Status akun Owner / Superadmin tidak dapat diubah.")
    if user_id == me["id"] and not body.is_admin:
        raise HTTPException(400, "Tidak bisa mencabut akses admin dari diri sendiri.")
    return await admin_mod.set_admin(me["id"], user_id, body.is_admin)


@app.delete("/api/admin/users/{user_id}")
async def api_admin_delete_user(user_id: str, request: Request, authorization: str | None = Header(None)):
    from . import admin as admin_mod
    me = await require_owner_user(request, authorization)
    ensure_uuid(user_id, "User")
    if user_id == OWNER_USER_ID:
        raise HTTPException(403, "Akun Owner / Superadmin tidak dapat dihapus.")
    try:
        return await admin_mod.delete_user(me["id"], user_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:
        raise HTTPException(500, f"Gagal menghapus akun: {exc}")


@app.delete("/api/admin/users/{user_id}/projects")
async def api_admin_delete_user_projects(user_id: str, request: Request, authorization: str | None = Header(None)):
    from . import admin as admin_mod
    me = await require_owner_user(request, authorization)
    ensure_uuid(user_id, "User")
    if user_id == OWNER_USER_ID:
        raise HTTPException(403, "Proyek akun Owner / Superadmin tidak dapat dihapus oleh pihak lain.")
    try:
        return await admin_mod.delete_user_projects(me["id"], user_id)
    except Exception as exc:
        raise HTTPException(500, f"Gagal menghapus project user: {exc}")


# ---------------------------------------------------------------------------
# Pengaturan Harga Paket Premium Dinamis
# ---------------------------------------------------------------------------

@app.get("/api/admin/pricing")
async def api_admin_get_pricing(request: Request, authorization: str | None = Header(None)):
    await require_admin_user(request, authorization)
    from .pricing_config import get_pricing_plans, DEFAULT_PLANS
    return {
        "current": get_pricing_plans(),
        "defaults": DEFAULT_PLANS,
    }


@app.post("/api/admin/pricing")
async def api_admin_update_pricing(body: PricingUpdateIn, request: Request, authorization: str | None = Header(None)):
    await require_admin_user(request, authorization)
    from .pricing_config import set_pricing_plans
    from .admin_logs import log_system
    updated = set_pricing_plans(body.plans)
    log_system("Admin Action", "Owner memperbarui harga & diskon paket premium", user="owner")
    return {"ok": True, "plans": updated}


@app.post("/api/admin/pricing/reset")
async def api_admin_reset_pricing(request: Request, authorization: str | None = Header(None)):
    await require_admin_user(request, authorization)
    from .pricing_config import reset_pricing_plans
    from .admin_logs import log_system
    reset_plans = reset_pricing_plans()
    log_system("Admin Action", "Owner me-reset harga paket premium ke default", user="owner")
    return {"ok": True, "plans": reset_plans}



class AdminRequestIn(BaseModel):
    action_type: str
    target_user_id: str
    target_email: str
    payload: dict
    reason: str

@app.post("/api/admin/requests")
async def api_admin_submit_request(body: AdminRequestIn, request: Request, authorization: str | None = Header(None)):
    from . import admin as admin_mod
    me = await require_admin_user(request, authorization)
    if is_owner_account(me):
        raise HTTPException(400, "Owner tidak perlu meminta izin.")
    try:
        return await admin_mod.submit_admin_request(me, body)
    except Exception as exc:
        raise HTTPException(500, f"Gagal membuat permohonan: {exc}")

@app.get("/api/admin/requests/pending")
async def api_admin_get_pending_requests(request: Request, authorization: str | None = Header(None)):
    me = await require_admin_user(request, authorization)
    from . import admin as admin_mod
    return await admin_mod.get_pending_requests(me)
    
@app.post("/api/admin/requests/{request_id}/approve")
async def api_admin_approve_request(request_id: str, request: Request, authorization: str | None = Header(None)):
    me = await require_owner_user(request, authorization)
    from . import admin as admin_mod
    try:
        return await admin_mod.approve_admin_request(me["id"], request_id)
    except Exception as exc:
        raise HTTPException(400, str(exc))

@app.post("/api/admin/requests/{request_id}/reject")
async def api_admin_reject_request(request_id: str, request: Request, authorization: str | None = Header(None)):
    me = await require_owner_user(request, authorization)
    from . import admin as admin_mod
    try:
        return await admin_mod.reject_admin_request(me["id"], request_id)
    except Exception as exc:
        raise HTTPException(400, str(exc))


# ---------------------------------------------------------------------------
# YouTube (hydra downloader) + share + quota + premium (Pakasir)
# ---------------------------------------------------------------------------

@app.post("/api/youtube/process")
async def api_youtube_process(body: YoutubeIn, request: Request, authorization: str | None = Header(None)):
    user = await get_user(request, authorization)
    url = body.url.strip()
    if not re.match(r"^https?://", url):
        raise HTTPException(400, "URL tidak valid")
    from .premium import quota_check_project, limits_for, MSG_LIMIT_PROJECT
    quota = await quota_check_project(user["id"])
    if not quota["ok"]:
        raise HTTPException(429, quota["message"] or MSG_LIMIT_PROJECT)
    lim = await limits_for(user["id"])
    target = body.target_count or lim["clips_per_video"]
    target = min(target, lim["clips_per_video"])
    # buat project row (status downloading) langsung dari server
    from .premium import sb
    rows = await sb("POST", "projects", json_body=[{
        "user_id": user["id"], "title": "Memuat video YouTube…",
        "source_type": "youtube", "source_url": url, "status": "downloading",
    }])
    project_id = rows[0]["id"]
    from .background import spawn
    spawn(_youtube_task(project_id, user["id"], url, target),
          name=f"youtube:{project_id[:8]}", key=f"proyek:{project_id}")
    return {"project_id": project_id, "plan": quota["plan"], "target_clips": target}


async def _youtube_task(project_id: str, user_id: str, url: str, target: int) -> None:
    from .youtube import run_youtube_pipeline
    await run_youtube_pipeline(project_id, user_id, url, target)


@app.get("/api/quota")
async def api_quota(request: Request, authorization: str | None = Header(None)):
    user = await get_user(request, authorization)
    from .premium import quota_check_project
    return await quota_check_project(user["id"])


@app.post("/api/projects/{project_id}/share")
async def api_project_share(project_id: str, request: Request, authorization: str | None = Header(None)):
    user = await get_user(request, authorization)
    ensure_uuid(project_id)
    from .premium import create_share
    try:
        return await create_share(user["id"], project_id)
    except PermissionError as exc:
        raise HTTPException(404, str(exc))


@app.get("/api/share/{token}")
async def api_share_view(token: str):
    from .premium import get_shared
    try:
        return await get_shared(token)
    except LookupError as exc:
        raise HTTPException(404, str(exc))


@app.post("/api/share/{token}/accept")
async def api_share_accept(token: str, request: Request, authorization: str | None = Header(None)):
    user = await get_user(request, authorization)
    from .premium import accept_share
    try:
        return await accept_share(token, user["id"])
    except LookupError as exc:
        raise HTTPException(404, str(exc))


@app.get("/api/showcase")
async def api_showcase():
    """Bukti hasil NYATA untuk landing page — tanpa login.

    Permintaan pengguna: "tambahin preview di landing page biar user tau
    hasilnya dan terbukti juga dan bisa dipercaya."

    PRIVASI: hanya klip milik akun ADMIN yang ditampilkan. Klip pengguna lain
    TIDAK PERNAH bocor ke halaman publik walaupun sudah dirender — pemiliknya
    tidak pernah menyetujui itu. Admin = pemilik situs, jadi videonya memang
    sengaja dipamerkan.

    Hasil di-cache 5 menit di memori: halaman depan adalah target trafik
    terbesar dan tidak boleh memukul PostgREST tiap kunjungan.
    """
    import time as _t
    global _SHOWCASE_CACHE
    now = _t.time()
    if _SHOWCASE_CACHE and now - _SHOWCASE_CACHE[0] < 300:
        return _SHOWCASE_CACHE[1]

    from .premium import sb
    try:
        admins = await sb("GET", "profiles?select=user_id&is_admin=is.true&limit=5") or []
        ids = [a["user_id"] for a in admins if a.get("user_id")]
        if not ids:
            return {"clips": []}
        daftar = ",".join(ids)
        jobs = await sb("GET", "render_jobs?select=clip_id,clip_title,rendered_url,"
                               f"completed_at&status=eq.completed&user_id=in.({daftar})"
                               "&order=completed_at.desc&limit=24") or []
        out = []
        lihat: set[str] = set()
        for j in jobs:
            cid = str(j.get("clip_id") or "")
            if not j.get("rendered_url") or cid in lihat:
                continue
            lihat.add(cid)
            klip = await sb("GET", f"clips?id=eq.{cid}&select=virality_score,"
                                   "start_time,end_time,description,hashtags,title") or []
            k = klip[0] if klip else {}
            out.append({
                "title": j.get("clip_title") or k.get("title") or "Klip",
                "url": j.get("rendered_url"),
                "score": k.get("virality_score"),
                "duration": round(float(k.get("end_time") or 0)
                                  - float(k.get("start_time") or 0)),
                "description": (k.get("description") or "")[:180],
                "hashtags": (k.get("hashtags") or [])[:4],
            })
            if len(out) >= 6:
                break

        # FALLBACK (kenapa showcase sempat selalu kosong): unduhan async
        # menulis preview di clips.preview_url, TIDAK di render_jobs — klip
        # admin terbaru tetap harus tampil walau belum pernah "diunduh".
        if not out:
            pre = await sb("GET", "clips?select=id,title,preview_url,virality_score,"
                                  "start_time,end_time,description,hashtags"
                                  f"&user_id=in.({daftar})&preview_ready=is.true"
                                  "&preview_url=not.is.null"
                                  "&order=updated_at.desc&limit=6") or []
            for k in pre:
                if not k.get("preview_url") or str(k["id"]) in lihat:
                    continue
                lihat.add(str(k["id"]))
                out.append({
                    "title": k.get("title") or "Klip",
                    "url": k.get("preview_url"),
                    "score": k.get("virality_score"),
                    "duration": round(float(k.get("end_time") or 0)
                                      - float(k.get("start_time") or 0)),
                    "description": (k.get("description") or "")[:180],
                    "hashtags": (k.get("hashtags") or [])[:4],
                })
        hasil = {"clips": out}
        _SHOWCASE_CACHE = (now, hasil)
        return hasil
    except Exception as exc:
        print(f"[showcase] gagal: {str(exc)[:140]}")
        return {"clips": []}


class RegisterOtpIn(BaseModel):
    email: str
    password: str
    display_name: Optional[str] = None


@app.post("/api/auth/register-otp")
async def api_register_otp(
    body: RegisterOtpIn,
    request: Request,
    x_turnstile_token: Optional[str] = Header(None, alias="X-Turnstile-Token"),
):
    """Daftar akun unconfirmed di GoTrue, buat kode OTP 6 angka, dan kirim via email."""
    from .anti_bot import is_disposable_email, is_suspicious_bot, check_ip_rate_limit, verify_turnstile_token
    from .admin_logs import log_system

    ip = request.headers.get("x-forwarded-for", "") or (request.client.host if request.client else "127.0.0.1")
    ua = request.headers.get("user-agent", "")

    # 1. Anti-Bot / Anti-Headless checks
    if is_suspicious_bot(ua, dict(request.headers)):
        log_system("Security Alert", f"Blokir akses bot/headless browser: {ua[:50]} (IP: {ip})", level="WARNING")
        raise HTTPException(403, "Akses ditolak: Terdeteksi aktivitas bot otomatis.")

    # 2. Anti-Spam Rate Limit per IP
    if not check_ip_rate_limit(ip):
        log_system("Security Alert", f"Blokir spam pendaftaran: Terlalu banyak akun dari IP {ip}", level="WARNING")
        raise HTTPException(429, "Terlalu banyak permintaan pendaftaran. Silakan coba lagi nanti.")

    # 3. Cloudflare Turnstile Verification
    token = x_turnstile_token or request.headers.get("cf-turnstile-response") or ""
    if not await verify_turnstile_token(token, remote_ip=ip):
        raise HTTPException(403, "Verifikasi keamanan Cloudflare Turnstile gagal. Silakan muat ulang halaman.")

    clean_email = body.email.strip().lower()
    if not clean_email or "@" not in clean_email:
        raise HTTPException(400, "Format email tidak valid.")

    # 4. Anti-Nuyul: Blokir Temporary / Disposable Email
    if is_disposable_email(clean_email):
        log_system("Security Alert", f"Blokir pendaftaran email sementara/disposable: {clean_email} (IP: {ip})", level="WARNING")
        raise HTTPException(400, "Penggunaan email sementara/disposable dilarang. Gunakan email resmi (Gmail, Yahoo, dll).")

    if len(body.password) < 6:
        raise HTTPException(400, "Password minimal 6 karakter.")

    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.post(
            f"{SUPABASE_URL}/auth/v1/admin/generate_link",
            headers={
                "apikey": SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "type": "signup",
                "email": clean_email,
                "password": body.password,
                "data": {"display_name": body.display_name or clean_email.split("@")[0]},
            },
        )
        if res.status_code not in (200, 201):
            detail = res.json().get("msg") or res.json().get("error_description") or "Gagal mendaftarkan akun."
            raise HTTPException(400, detail)

        data = res.json()
        otp = data.get("email_otp") or ""
        print(f"[AUTH_OTP] Email: {clean_email} -> OTP: {otp}")

        resend_key = os.environ.get("RESEND_API_KEY", "").strip()
        email_sent = False
        try:
            r_mail = await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {resend_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": "CortexClip Verification <verifikasi@aqualibrya.my.id>",
                    "to": [clean_email],
                    "subject": f"Kode Verifikasi CortexClip: {otp}",
                    "html": f"""
                    <div style="font-family:sans-serif;background:#0b0b0f;color:#fff;padding:30px;border-radius:12px;max-width:480px;margin:auto;">
                      <h2 style="color:#f59e0b;margin-top:0;">CortexClip AI</h2>
                      <p>Kode verifikasi pendaftaran kamu:</p>
                      <div style="background:#181824;border:1px solid #333;border-radius:8px;padding:16px;text-align:center;font-size:32px;font-weight:bold;letter-spacing:6px;color:#fff;margin:20px 0;">
                        {otp}
                      </div>
                      <p style="color:#aaa;font-size:12px;">Masukkan kode ini pada layar pendaftaran untuk mengaktifkan akun. Kode berlaku 1 jam.</p>
                      <p style="color:#666;font-size:11px;border-top:1px solid #222;padding-top:12px;">Ikuti grup diskusi CortexClip AI di WhatsApp: https://chat.whatsapp.com/EQBUHFIuOTG4ziEGLWhZG5</p>
                    </div>
                    """,
                },
            )
            if r_mail.status_code in (200, 201):
                email_sent = True
        except Exception as exc:
            print(f"[AUTH_OTP] Kirim email gagal: {exc}")

        return {
            "success": True,
            "email": clean_email,
            "email_sent": email_sent,
            "message": "Kode verifikasi 6 digit telah dikirim ke email kamu.",
        }


@app.get("/api/premium/plans")
async def api_premium_plans():
    from .pricing_config import get_pricing_plans
    plans = get_pricing_plans()
    return {"plans": [
        {
            "key": k,
            "label": v["label"],
            "amount": v["amount"],
            "original_amount": v.get("original_amount", v["amount"]),
            "discount_percent": v.get("discount_percent", 0),
            "discount_label": v.get("discount_label", ""),
            "days": v["days"],
        }
        for k, v in plans.items()
    ]}


@app.post("/api/premium/checkout")
async def api_premium_checkout(body: CheckoutIn, request: Request, authorization: str | None = Header(None)):
    user = await get_user(request, authorization)
    from .premium import create_checkout
    try:
        return await create_checkout(user["id"], body.plan)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:
        raise HTTPException(502, f"Pakasir: {exc}")


@app.get("/api/premium/qr/{order_id}")
async def api_premium_qr(order_id: str):
    """QR PNG untuk order (verifikasi service-role: order_id + amount rahasia)."""
    import io
    from .premium import sb, PAKASIR_API_KEY
    rows = await sb("GET", f"premium_orders?order_id=eq.{order_id}&select=amount")
    if not rows:
        raise HTTPException(404, "order tidak ditemukan")
    from .premium import pakasir_create_qris
    pay = await pakasir_create_qris(order_id, rows[0]["amount"]) if PAKASIR_API_KEY else {}
    qris = pay.get("payment_number") or ""
    if not qris:
        raise HTTPException(404, "QRIS tidak tersedia")
    import qrcode
    img = qrcode.make(qris)
    buf = io.BytesIO()
    img.save(buf, "PNG")
    from fastapi.responses import Response
    return Response(content=buf.getvalue(), media_type="image/png")


@app.post("/app/webhook")
async def api_pakasir_webhook(request: Request):
    """Webhook Pakasir — TANPA auth (dipanggil server Pakasir)."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(400, "body bukan JSON")
    from .premium import handle_webhook
    result = await handle_webhook(body)
    return result


@app.get("/api/premium/order/{order_id}")
async def api_premium_order(order_id: str, request: Request, authorization: str | None = Header(None)):
    user = await get_user(request, authorization)
    from .premium import get_order_status
    try:
        return await get_order_status(user["id"], order_id)
    except LookupError as exc:
        raise HTTPException(404, str(exc))


# ---------------------------------------------------------------------------
# Project management: rename / delete penuh / touch
# ---------------------------------------------------------------------------

class RenameIn(BaseModel):
    title: str


@app.patch("/api/projects/{project_id}")
async def api_project_rename(project_id: str, body: RenameIn, request: Request, authorization: str | None = Header(None)):
    user = await get_user(request, authorization)
    ensure_uuid(project_id)
    from .premium import sb
    rows = await sb("GET", f"projects?id=eq.{project_id}&user_id=eq.{user['id']}&select=id")
    if not rows:
        raise HTTPException(404, "Proyek tidak ditemukan / bukan milikmu")
    title = body.title.strip()[:200] or "Tanpa judul"
    await sb("PATCH", f"projects?id=eq.{project_id}", json_body={"title": title})
    return {"ok": True, "title": title}


@app.post("/api/projects/{project_id}/touch")
async def api_project_touch(project_id: str, request: Request, authorization: str | None = Header(None)):
    user = await get_user(request, authorization)
    ensure_uuid(project_id)
    from .premium import sb
    try:
        await sb("PATCH", f"projects?id=eq.{project_id}&user_id=eq.{user['id']}",
                 json_body={"updated_at": "now()"})
    except Exception:
        pass
    return {"ok": True}


@app.delete("/api/projects/{project_id}")
async def api_project_delete(project_id: str, request: Request, authorization: str | None = Header(None)):
    """Hapus PENUH: render_jobs, klip, file storage (video sumber + rendered),
    lalu row project. Verifikasi kepemilikan via user_id."""
    user = await get_user(request, authorization)
    ensure_uuid(project_id)
    from .premium import sb
    rows = await sb("GET", f"projects?id=eq.{project_id}&user_id=eq.{user['id']}&select=id,source_url,storage_path")
    if not rows:
        raise HTTPException(404, "Proyek tidak ditemukan / bukan milikmu")
    proj = rows[0]
    src = proj.get("storage_path") or ""
    su = proj.get("source_url") or ""
    prefixes = [p for p in (src, su) if p and not str(p).startswith("http")]

    # 1) kumpulkan id klip (untuk file rendered) SEBELUM dihapus
    clip_ids: list[str] = []
    try:
        clip_ids = [c["id"] for c in (await sb("GET", f"clips?project_id=eq.{project_id}&select=id")) or []]
    except Exception:
        pass

    # 2) hapus render_jobs & klip (service role)
    try:
        await sb("DELETE", f"render_jobs?project_id=eq.{project_id}")
    except Exception as exc:
        print(f"[projects] hapus render_jobs gagal: {exc}")
    try:
        await sb("DELETE", f"clips?project_id=eq.{project_id}")
    except Exception as exc:
        print(f"[projects] hapus clips gagal: {exc}")

    # 3) hapus file storage: sumber video + hasil render
    del_prefixes = prefixes + [f"{user['id']}/rendered/{cid}.mp4" for cid in clip_ids]
    if del_prefixes:
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                await client.post(
                    f"{SUPABASE_URL}/storage/v1/object/video-uploads/delete",
                    headers={"apikey": SUPABASE_SERVICE_KEY,
                             "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                             "Content-Type": "application/json"},
                    json={"prefixes": del_prefixes},
                )
        except Exception as exc:
            print(f"[projects] hapus file storage gagal: {exc}")

    # 4) hapus row project
    await sb("DELETE", f"projects?id=eq.{project_id}&user_id=eq.{user['id']}")
    return {"ok": True}


@app.post("/api/projects/upload-done")
async def api_project_upload_done(request: Request, authorization: str | None = Header(None)):
    """Dipanggil frontend SETELAH file selesai keupload ke storage.
    Mulai pipeline server-side (transcribe -> clips)."""
    class _Body(BaseModel):
        project_id: str
        storage_path: str
    try:
        body = _Body(**(await request.json()))
    except Exception:
        raise HTTPException(400, "body tidak valid")
    user = await get_user(request, authorization)
    ensure_uuid(body.project_id)
    from .premium import quota_check_project, limits_for, sb, MSG_LIMIT_PROJECT
    quota = await quota_check_project(user["id"])
    if not quota["ok"]:
        raise HTTPException(429, quota["message"] or MSG_LIMIT_PROJECT)
    # pastikan project milik user & masih menunggu
    rows = await sb("GET", f"projects?id=eq.{body.project_id}&user_id=eq.{user['id']}&select=id,status")
    if not rows:
        raise HTTPException(404, "Proyek tidak ditemukan / bukan milikmu")
    lim = await limits_for(user["id"])
    target = lim["clips_per_video"]
    await sb("PATCH", f"projects?id=eq.{body.project_id}",
             json_body={"storage_path": body.storage_path, "source_url": body.storage_path,
                        "status": "downloading"})
    from .background import spawn
    spawn(_upload_task(body.project_id, user["id"], body.storage_path, target),
          name=f"upload:{body.project_id[:8]}", key=f"proyek:{body.project_id}")
    return {"ok": True, "target_clips": target}


async def _upload_task(project_id: str, user_id: str, storage_path: str, target: int) -> None:
    from .youtube import run_upload_pipeline
    await run_upload_pipeline(project_id, user_id, storage_path, target)


@app.post("/api/projects/{project_id}/reprocess")
async def api_project_reprocess(
    project_id: str,
    request: Request,
    authorization: Optional[str] = Header(None),
):
    """PROSES ULANG via SERVER (bukan browser).

    Mengganti pipeline client-side yang lama — kalau user tutup tab/HP lock,
    dulu project nyangkut "transcribing" selamanya. Sekarang semua berjalan
    di server seperti proses awal: transkripsi + seleksi klip + simpan DB.
    Wajib: project punya storage_path (video sumber tersimpan di server).
    """
    user = await get_user(request, authorization)
    ensure_uuid(project_id)
    from .premium import sb, quota_check_project, MSG_LIMIT_PROJECT, limits_for
    quota = await quota_check_project(user["id"])
    if not quota["ok"]:
        raise HTTPException(429, quota["message"] or MSG_LIMIT_PROJECT)

    rows = await sb("GET", f"projects?id=eq.{project_id}&user_id=eq.{user['id']}"
                           "&select=id,status,storage_path,source_url,source_type")
    if not rows:
        raise HTTPException(404, "Proyek tidak ditemukan / bukan milikmu")
    proj = rows[0]
    # SUMBER: storage_path (hasil unggahan) ATAU source_url YouTube.
    # Dulu hanya storage_path yang diterima, jadi proyek YouTube yang baru
    # selesai — unggahan sumber ke storage masih berjalan di belakang —
    # ditolak 400 "belum punya file sumber" padahal videonya bisa diunduh
    # ulang dari source_url. Terukur di E2E: proyek f11bee86 selesai
    # (10 klip) tapi reprocess balas 400.
    storage_path = proj.get("storage_path")
    source_url = str(proj.get("source_url") or "")
    if not storage_path and not source_url.startswith("http"):
        raise HTTPException(
            400,
            "Proyek lama ini belum punya file sumber di server. Unggah ulang videonya "
            "atau proses dari link YouTube, lalu proses ulang akan berjalan di server.",
        )
    status = str(proj.get("status") or "")
    if status in ("downloading", "transcribing", "analyzing"):
        raise HTTPException(409, "Proyek sedang diproses — tunggu sampai selesai.")

    lim = await limits_for(user["id"])
    target = lim["clips_per_video"]

    # bersihkan klip lama supaya tidak dobel
    await sb("DELETE", f"clips?project_id=eq.{project_id}")
    await sb("PATCH", f"projects?id=eq.{project_id}",
             json_body={"status": "downloading", "error_message": None})

    from .background import spawn
    if storage_path:
        spawn(_reprocess_task(project_id, user["id"], storage_path, target),
              name=f"reproses:{project_id[:8]}", key=f"proyek:{project_id}")
    else:
        # tanpa berkas di storage → unduh ulang dari link sumber (YouTube)
        spawn(_reprocess_youtube_task(project_id, user["id"], source_url, target),
              name=f"reproses-yt:{project_id[:8]}", key=f"proyek:{project_id}")
    return {"ok": True, "status": "downloading", "target_clips": target}


async def _reprocess_task(project_id: str, user_id: str, storage_path: str, target: int) -> None:
    from .youtube import run_upload_pipeline
    await run_upload_pipeline(project_id, user_id, storage_path, target)


async def _reprocess_youtube_task(project_id: str, user_id: str, url: str, target: int) -> None:
    from .youtube import run_youtube_pipeline
    await run_youtube_pipeline(project_id, user_id, url, target)


@app.get("/")
async def root():
    return {"service": "cortexclip-backend", "docs": "/docs"}


# ---------------------------------------------------------------------------
# Render-job watchdog: job "pending"/"rendering" yang tidak lagi diproses
# (mis. service restart saat render berjalan → task in-process hilang)
# otomatis ditandai failed, supaya user bisa menekan render ulang dan tidak
# melihat "Sedang merender..." selamanya.
# ---------------------------------------------------------------------------
_STALE_RENDER_SEC = 20 * 60  # render normal < 10 menit; 20 menit = pasti mati


async def _reap_stale_render_jobs() -> None:
    while True:
        try:
            now = datetime.now(timezone.utc)
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(
                    f"{SUPABASE_URL}/rest/v1/render_jobs"
                    "?status=in.(pending,rendering)&select=id,status,updated_at",
                    headers={"apikey": SUPABASE_SERVICE_KEY,
                             "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"},
                )
                if r.status_code == 200:
                    for job in r.json():
                        try:
                            upd = datetime.fromisoformat(
                                str(job["updated_at"]).replace("Z", "+00:00"))
                        except Exception:
                            continue
                        if (now - upd).total_seconds() > _STALE_RENDER_SEC:
                            await client.patch(
                                f"{SUPABASE_URL}/rest/v1/render_jobs?id=eq.{job['id']}",
                                headers={"apikey": SUPABASE_SERVICE_KEY,
                                         "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                                         "Content-Type": "application/json"},
                                json={"status": "failed",
                                      "error": "Render terputus (server restart). Tekan render ulang."},
                            )
                            print(f"[render-watchdog] job {job['id'][:8]} → failed (stale)")
        except Exception as exc:
            print(f"[render-watchdog] error: {exc}")
        await asyncio.sleep(120)


async def _hydra_stat_loop() -> None:
    """Pulihkan lalu simpan statistik sukses/gagal model secara berkala.

    Tanpa pemulihan, tiap `systemctl restart` (setiap deploy) mengembalikan
    angka di panel admin ke 0. Penyimpanan dijalankan tiap 60s; fungsinya
    sendiri men-debounce 30s dan melewati saat tidak ada perubahan, jadi
    beban DB-nya kecil.
    """
    await gateway.muat_statistik()
    while True:
        try:
            await asyncio.sleep(60)
            await gateway.simpan_statistik()
        except asyncio.CancelledError:
            # shutdown: paksa simpan supaya hitungan terakhir tidak hilang
            try:
                await gateway.simpan_statistik(paksa=True)
            except Exception:
                pass
            raise
        except Exception as exc:
            print(f"[model-stats] loop: {exc}")


@app.on_event("startup")
async def _start_render_watchdog() -> None:
    # saat startup: job "rendering" dari proses sebelumnya pasti mati → failed
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            await client.patch(
                f"{SUPABASE_URL}/rest/v1/render_jobs?status=eq.rendering",
                headers={"apikey": SUPABASE_SERVICE_KEY,
                         "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                         "Content-Type": "application/json"},
                json={"status": "failed",
                      "error": "Server restart saat render — tekan render ulang."},
            )
    except Exception as exc:
        print(f"[render-watchdog] startup sweep gagal: {exc}")
    from .background import spawn
    spawn(_reap_stale_render_jobs(), name="watchdog:render")
    # order QRIS pending yang lewat 60 menit ditutup otomatis, walau user
    # sudah menutup tab (get_order_status hanya jalan saat dialog terbuka)
    from .premium import reap_expired_orders_loop
    spawn(reap_expired_orders_loop(), name="watchdog:qris")
    # Statistik sukses/gagal per model AI (panel admin): pulihkan dari DB lalu
    # simpan berkala supaya angkanya selamat dari restart server.
    spawn(_hydra_stat_loop(), name="watchdog:model-stats")
    # CATATAN: penjadwal auto-publish TikTok/YouTube DIHAPUS atas permintaan
    # pengguna ("hapus aja fitur auto publish karena gak jadi pakai").


# ---------------------------------------------------------------------------
# Endpoint modul terpisah — didaftarkan SETELAH semua helper global siap
# ---------------------------------------------------------------------------
from .broll_api import register_broll_routes  # noqa: E402

register_broll_routes(app, get_user, SUPABASE_URL, SUPABASE_ANON_KEY)
