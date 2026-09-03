"""Job store — in-memory jobs + persistence of results into Supabase.

The frontend keeps using Supabase directly for projects/clips (RLS enforced).
This backend adds: job runner (transcribe chunks -> select clips -> render),
status polling, rendered file serving, and Supabase service-role writes for
pipeline results.
"""

from __future__ import annotations

import os
import json
import time
import uuid
import asyncio
import tempfile
from typing import Any, Optional

import httpx

SUPABASE_URL = os.environ.get("SUPABASE_URL", "http://localhost:8000")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

OUTPUT_DIR = os.environ.get("OUTPUT_DIR", "/root/cortexclip/backend/output")
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "/root/cortexclip/backend/uploads")
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)

MAX_CONCURRENT = int(os.environ.get("MAX_CONCURRENT_JOBS", "2"))

jobs: dict[str, dict[str, Any]] = {}
_semaphore = asyncio.Semaphore(MAX_CONCURRENT)


def _headers():
    return {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


async def supabase_call(method: str, path: str, json_body=None, params=None) -> Any:
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.request(method, url, headers=_headers(), json=json_body, params=params)
    if resp.status_code >= 300:
        raise RuntimeError(f"Supabase {path}: {resp.status_code} {resp.text[:200]}")
    if resp.status_code == 204 or not resp.text:
        return None
    return resp.json()


async def update_project(project_id: str, **fields) -> None:
    await supabase_call("PATCH", f"projects?id=eq.{project_id}", json_body=fields)


async def replace_clips(project_id: str, user_id: str, clips: list[dict[str, Any]]) -> None:
    await supabase_call("DELETE", f"clips?project_id=eq.{project_id}")
    rows = []
    for c in clips:
        rows.append({
            "project_id": project_id,
            "user_id": user_id,
            "title": c["title"],
            "description": c["description"],
            "hashtags": c["hashtags"],
            "start_time": c["start"],
            "end_time": c["end"],
            "virality_score": c["score"],
            "hook_type": c["hook"],
            "caption_words": c.get("caption_words"),
            "srt_content": c.get("srt"),
            "ass_content": c.get("ass"),
            "status": "detected",
        })
    if rows:
        await supabase_call("POST", "clips", json_body=rows)


async def run_pipeline(
    job_id: str,
    project_id: str,
    user_id: str,
    media_path: str,
    target_count: int,
    caption_style: dict[str, Any] | None,
) -> None:
    """Full pipeline: probe -> transcribe (browser pushes chunks separately) ->
    detect clips -> render each clip with burned karaoke subtitles."""
    from .transcribe import transcript_with_words
    from .clip_selection import detect_clips
    from .subtitles import build_ass, build_srt
    from . import render as render_mod

    job = jobs[job_id]
    try:
        async with _semaphore:
            job["status"] = "analyzing"
            job["progress"] = 0.1
            await update_project(project_id, status="analyzing")

            # transcript must have been assembled by /api/transcribe/commit
            transcript = job.get("transcript")
            if not transcript or not transcript.get("segments"):
                raise RuntimeError("Transkrip belum tersedia.")

            job["progress"] = 0.3
            clips = await detect_clips(transcript, target_count)
            if not clips:
                raise RuntimeError("AI tidak menemukan klip yang layak dari transkrip ini.")

            job["status"] = "rendering"
            job["progress"] = 0.5
            await update_project(project_id, status="rendering")

            from .subtitles import DEFAULT_STYLE
            style = dict(DEFAULT_STYLE)
            if caption_style:
                style.update(caption_style)

            # figure media absolute duration
            duration = render_mod.probe_duration(media_path)
            for c in clips:
                c["end"] = min(c["end"], duration)

            for i, c in enumerate(clips):
                ass = build_ass(c["caption_words"], style)
                c["ass"] = ass
                c["srt"] = build_srt(c["caption_words"])

            await replace_clips(project_id, user_id, clips)
            job["progress"] = 0.75
            # pra-render preview semua klip di belakang (lihat prerender.py)
            try:
                from .prerender import jadwalkan
                jadwalkan(project_id)
            except Exception:
                pass

            # render each clip to output dir
            rendered = []
            for i, c in enumerate(clips):
                out_name = f"{job_id}_{i}_{uuid.uuid4().hex[:6]}.mp4"
                out_path = os.path.join(OUTPUT_DIR, out_name)
                try:
                    traj = render_mod.analyze_face_track(media_path, c["start"], c["end"])
                except Exception:
                    traj = None
                with tempfile.NamedTemporaryFile("w", suffix=".ass", delete=False) as f:
                    f.write(c["ass"])
                    ass_path = f.name
                try:
                    render_mod.render_clip(
                        media_path, c["start"], c["end"], ass_path, out_path,
                        resolution="1080x1920",
                        face_tracking=bool(traj),
                        camera_trajectory=traj,
                    )
                    rendered.append({
                        "index": i,
                        "title": c["title"],
                        "score": c["score"],
                        "file": out_name,
                        "url": f"/files/{out_name}",
                    })
                finally:
                    os.unlink(ass_path)
                job["progress"] = 0.75 + 0.2 * (i + 1) / max(1, len(clips))

            job["status"] = "completed"
            job["progress"] = 1.0
            job["clips"] = rendered
            await update_project(project_id, status="completed")
    except Exception as exc:
        job["status"] = "failed"
        job["error"] = str(exc)
        try:
            await update_project(project_id, status="failed", error_message=str(exc)[:500])
        except Exception:
            pass
