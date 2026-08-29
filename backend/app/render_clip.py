"""Render a single clip server-side: download source from Supabase storage,
burn karaoke ASS + optional hook overlay, render vertical MP4, upload result
back to storage, update the clip row. Called from the frontend with the
user's Supabase JWT.
"""
from __future__ import annotations

import os
import json
import tempfile
import uuid
import time
from typing import Any, Optional

import httpx

from .subtitles import build_ass, build_srt, DEFAULT_STYLE
from . import render as render_mod

SUPABASE_URL = os.environ.get("SUPABASE_URL", "http://localhost:8000")
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
    storage_path = project.get("storage_path")
    if not storage_path:
        raise RuntimeError("Project belum punya file media di storage")

    workdir = tempfile.mkdtemp(prefix="cortexclip_render_")
    try:
        src = os.path.join(workdir, "source.mp4")
        await download_from_storage(storage_path, src)

        words = (clip.get("caption_words") or [])
        if not isinstance(words, list) or not words:
            raise RuntimeError("Klip belum punya caption words")

        style = dict(DEFAULT_STYLE)
        if caption_style:
            style.update(caption_style)

        ass = build_ass(words, style)
        ass_path = os.path.join(workdir, "subs.ass")
        with open(ass_path, "w", encoding="utf-8") as f:
            f.write(ass)

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

        render_mod.render_clip(
            src, start, end, ass_path, out_path,
            resolution=resolution,
            face_tracking=bool(traj),
            camera_trajectory=traj,
        )

        # optional hook overlay burn
        if hook_text and hook_text.strip():
            hooked = os.path.join(workdir, "hooked.mp4")
            render_mod.burn_hook_overlay(out_path, hook_text.strip(), hooked)
            out_path = hooked

        user_id = clip.get("user_id") or project.get("user_id")
        storage_key = f"{user_id}/rendered/{clip_id}.mp4"
        await upload_to_storage(out_path, storage_key)

        # update clip row: status + rendered url
        rendered_url = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{storage_key}"
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
