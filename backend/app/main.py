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
import json
import base64
import binascii
import asyncio
import secrets
import time
import uuid
from typing import Any, Optional

import httpx
import jwt as pyjwt
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from .hydra import gateway, HydraError
from . import jobs as jobs_mod
from .jobs import jobs, run_pipeline, update_project
from .subtitles import build_ass, build_srt, DEFAULT_STYLE, EFFECTS

SUPABASE_URL = os.environ.get("SUPABASE_URL", "http://localhost:8000")
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

async def get_user(request: Request, authorization: Optional[str]) -> dict[str, Any]:
    """Validate the Supabase user JWT and return {id, email}."""
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
    return {"id": data["id"], "email": data.get("email", "")}


def require_admin(authorization: Optional[str]) -> None:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing admin token")
    token = authorization.split(" ", 1)[1]
    exp = ADMIN_TOKENS.get(token)
    if not exp or exp < time.time():
        ADMIN_TOKENS.pop(token, None)
        raise HTTPException(401, "Admin token expired")


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


class AssIn(BaseModel):
    words: list[dict[str, Any]]
    style: dict[str, Any] | None = None


# ---------------------------------------------------------------------------
# Health & meta
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {"ok": True, "service": "cortexclip-backend"}


@app.get("/api/caption-effects")
async def caption_effects():
    return {"effects": list(EFFECTS), "default": DEFAULT_STYLE}


# ---------------------------------------------------------------------------
# Transcription
# ---------------------------------------------------------------------------

@app.post("/api/transcribe/chunk")
async def transcribe_chunk(body: ChunkIn, request: Request, authorization: str = Header(None)):
    await get_user(request, authorization)
    from .transcribe import transcribe_wav_chunk
    try:
        wav = base64.b64decode(body.audio_base64, validate=False)
    except (binascii.Error, ValueError):
        raise HTTPException(400, "audio_base64 tidak valid")
    if len(wav) < 1000:
        raise HTTPException(400, "audio terlalu pendek")
    try:
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
# Hydra / admin
# ---------------------------------------------------------------------------

@app.get("/api/hydra/status")
async def hydra_status(request: Request, authorization: str = Header(None)):
    await get_user(request, authorization)
    return {"endpoints": gateway.status()}


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


@app.get("/")
async def root():
    return {"service": "cortexclip-backend", "docs": "/docs"}
