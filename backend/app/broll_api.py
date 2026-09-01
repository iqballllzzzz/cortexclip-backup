"""Endpoint B-roll: POST /api/broll/placements — AI placement ikon & b-roll
untuk satu klip. Body: {project_id, clip_id}. Return {placements: [...]}.

Endpoint ini didefinisikan LANGSUNG di main.py (register_broll_routes dipanggil
dari main.py) — param `request: Request` di signature endpoint utama FastAPI
memang dikenali; jebakan sebelumnya: nested function di factory kehilangan
konteks anotasi karena `Request` di-import di dalam scope factory.
"""
from __future__ import annotations

from typing import Any, Awaitable, Callable, Optional

import httpx
from pydantic import BaseModel

from fastapi import Header, HTTPException, Request


class BrollIn(BaseModel):
    project_id: str
    clip_id: str


def register_broll_routes(
    app,
    get_user: Callable[..., Awaitable[dict[str, Any]]],
    supabase_url: str,
    supabase_anon_key: str,
) -> None:
    """Daftarkan route broll ke aplikasi FastAPI utama."""

    async def api_broll_placements(
        body: BrollIn,
        request: Request,
        authorization: Optional[str] = Header(None),
    ) -> dict[str, Any]:
        user = await get_user(request, authorization)
        token = (authorization.split(" ", 1)[1]
                 if authorization and authorization.lower().startswith("bearer ") else "")

        async with httpx.AsyncClient(timeout=30) as client:
            cr = await client.get(
                f"{supabase_url}/rest/v1/clips?id=eq.{body.clip_id}"
                "&select=caption_words,end_time,start_time",
                headers={"apikey": supabase_anon_key,
                         "Authorization": f"Bearer {token}"},
            )
        if cr.status_code != 200:
            raise HTTPException(400, "Gagal memuat klip")
        rows = cr.json()
        if not rows:
            raise HTTPException(404, "Klip tidak ditemukan")
        clip = rows[0]
        words = clip.get("caption_words") or []
        if not isinstance(words, list) or not words:
            raise HTTPException(400, "Klip belum punya caption words")

        duration = float(clip.get("end_time") or 0) - float(clip.get("start_time") or 0)

        from .broll import compute_placements
        placements = await compute_placements(words, max(1.0, duration), use_ai=True)
        return {"placements": placements}

    app.post("/api/broll/placements")(api_broll_placements)
