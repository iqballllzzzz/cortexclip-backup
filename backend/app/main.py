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
    asyncio.create_task(run_pipeline(
        job_id, body.project_id, user["id"], body.media_path,
        body.target_count, body.caption_style,
    ))
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
    """Render preview klip resolusi rendah (360x640) dengan cepat — VPS yang nggarap.

    Browser memutar file preview kecil (~100-500KB) ini, bukan streaming seluruh
    video sumber 43MB → editor preview muncul instan tanpa lag.
    """
    user = await get_user(request, authorization)
    from .render_clip import render_preview_clip
    t0 = time.time()
    try:
        result = await render_preview_clip(
            body.project_id, body.clip_id, token=authorization.split(" ", 1)[1],
            caption_style=body.caption_style,
        )
    except Exception as exc:
        try:
            from .admin import log_usage
            await log_usage(user["id"], "preview", model="ffmpeg-preview", provider="local",
                            status="error", project_id=body.project_id,
                            meta={"error": str(exc)[:200]})
        except Exception:
            pass
        raise HTTPException(400, str(exc))
    try:
        from .admin import log_usage
        await log_usage(user["id"], "preview", model="ffmpeg-preview", provider="local",
                        latency_ms=int((time.time() - t0) * 1000), project_id=body.project_id)
    except Exception:
        pass
    return result


# ---------------------------------------------------------------------------
# Render jobs background (Unduh async — boleh keluar halaman)
# ---------------------------------------------------------------------------

class RenderJobIn(BaseModel):
    project_id: str
    clip_id: str
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

    asyncio.create_task(run_job())
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
            f"{SUPABASE_URL}/rest/v1/profiles?user_id=eq.{user['id']}&select=ads_watched,watermark_removed",
            headers={"apikey": SUPABASE_SERVICE_KEY,
                     "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}"},
        )
        rows = r.json() if r.status_code == 200 else []
    watched = int(rows[0].get("ads_watched") or 0) if rows else 0
    removed = bool(rows[0].get("watermark_removed")) if rows else False
    return {"ads_watched": watched, "watermark_removed": removed, "remaining": max(0, 4 - watched)}


# ---------------------------------------------------------------------------
# Hydra / admin
# ---------------------------------------------------------------------------

@app.get("/api/hydra/status")
async def hydra_status(request: Request, authorization: str | None = Header(None)):
    await get_user(request, authorization)
    return {"endpoints": gateway.status()}


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

async def require_admin_user(request: Request, authorization: Optional[str]) -> dict[str, Any]:
    """Verifikasi JWT user + pastikan dia admin. Return user dict."""
    from . import admin as admin_mod
    user = await get_user(request, authorization, check_ban=False)
    if not await admin_mod.is_admin(user["id"]):
        raise HTTPException(403, "Akses ditolak — akun ini bukan admin.")
    return user


class BanIn(BaseModel):
    duration: str            # '1d' | '5d' | '1mo' | 'permanent'
    reason: Optional[str] = ""


class PlanIn(BaseModel):
    plan: str                # 'free' | 'day' | '5day' | 'month' | 'year'


class AdminFlagIn(BaseModel):
    is_admin: bool


@app.get("/api/me/status")
async def api_me_status(request: Request, authorization: Optional[str] = Header(None)):
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
        "ban": ban,
        "quota": quota,
    }


@app.post("/api/me/login-event")
async def api_me_login_event(request: Request, authorization: Optional[str] = Header(None)):
    from . import admin as admin_mod
    user = await get_user(request, authorization, check_ban=False)
    ua = request.headers.get("user-agent", "")
    ip = request.headers.get("x-forwarded-for", "") or (request.client.host if request.client else "")
    await admin_mod.record_login(user["id"], ua, ip)
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
                        authorization: Optional[str] = Header(None)):
    from . import admin as admin_mod
    me = await require_admin_user(request, authorization)
    ensure_uuid(user_id, "User")
    if user_id == me["id"]:
        raise HTTPException(400, "Tidak bisa mem-ban akun sendiri.")
    try:
        return await admin_mod.ban_user(me["id"], user_id, body.duration, body.reason or "")
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@app.post("/api/admin/users/{user_id}/unban")
async def api_admin_unban(user_id: str, request: Request,
                          authorization: Optional[str] = Header(None)):
    from . import admin as admin_mod
    me = await require_admin_user(request, authorization)
    ensure_uuid(user_id, "User")
    return await admin_mod.unban_user(me["id"], user_id)


@app.post("/api/admin/users/{user_id}/plan")
async def api_admin_set_plan(user_id: str, body: PlanIn, request: Request,
                             authorization: Optional[str] = Header(None)):
    from . import admin as admin_mod
    me = await require_admin_user(request, authorization)
    ensure_uuid(user_id, "User")
    try:
        return await admin_mod.set_plan(me["id"], user_id, body.plan)
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@app.post("/api/admin/users/{user_id}/admin-flag")
async def api_admin_set_admin(user_id: str, body: AdminFlagIn, request: Request,
                              authorization: Optional[str] = Header(None)):
    from . import admin as admin_mod
    me = await require_admin_user(request, authorization)
    ensure_uuid(user_id, "User")
    if user_id == me["id"] and not body.is_admin:
        raise HTTPException(400, "Tidak bisa mencabut akses admin dari diri sendiri.")
    return await admin_mod.set_admin(me["id"], user_id, body.is_admin)


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
    asyncio.create_task(_youtube_task(project_id, user["id"], url, target))
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


@app.get("/api/premium/plans")
async def api_premium_plans():
    from .premium import PLANS
    return {"plans": [
        {"key": k, "label": v["label"], "amount": v["amount"], "days": v["days"]}
        for k, v in PLANS.items()
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
    asyncio.create_task(_upload_task(body.project_id, user["id"], body.storage_path, target))
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
                           "&select=id,status,storage_path")
    if not rows:
        raise HTTPException(404, "Proyek tidak ditemukan / bukan milikmu")
    proj = rows[0]
    if not proj.get("storage_path"):
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

    asyncio.create_task(_reprocess_task(project_id, user["id"], proj["storage_path"], target))
    return {"ok": True, "status": "downloading", "target_clips": target}


async def _reprocess_task(project_id: str, user_id: str, storage_path: str, target: int) -> None:
    from .youtube import run_upload_pipeline
    await run_upload_pipeline(project_id, user_id, storage_path, target)


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
    asyncio.create_task(_reap_stale_render_jobs())


# ---------------------------------------------------------------------------
# Endpoint modul terpisah — didaftarkan SETELAH semua helper global siap
# ---------------------------------------------------------------------------
from .broll_api import register_broll_routes  # noqa: E402

register_broll_routes(app, get_user, SUPABASE_URL, SUPABASE_ANON_KEY)
