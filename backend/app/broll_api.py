"""Endpoint B-roll: POST /api/broll/placements — AI placement ikon & b-roll
untuk satu klip. Body: {project_id, clip_id}. Return {placements: [...]}.

Juga GET /api/icons/{icon_id} — melayani PNG ikon yang SAMA PERSIS dengan
yang dibakar ffmpeg ke hasil unduhan (parity preview == result dijamin
karena keduanya memakai berkas yang sama, bukan dua implementasi warna).
"""
from __future__ import annotations

from typing import Any, Awaitable, Callable, Optional

import httpx
from pydantic import BaseModel

from fastapi import Header, HTTPException, Request
from fastapi.responses import FileResponse


class BrollIn(BaseModel):
    project_id: str
    clip_id: str
    # true = paksa AI merencanakan ulang (tombol "cari ulang" di editor)
    refresh: bool = False


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
                "&select=caption_words,end_time,start_time,overlay_plan",
                headers={"apikey": supabase_anon_key,
                         "Authorization": f"Bearer {token}"},
            )
            pr = await client.get(
                f"{supabase_url}/rest/v1/projects?id=eq.{body.project_id}"
                "&select=genre,transcript",
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

        # genre project (kalau belum ada, deteksi dari transkrip klip)
        genre = ""
        try:
            prows = pr.json() if pr.status_code == 200 else []
            genre = str((prows[0] if prows else {}).get("genre") or "")
        except Exception:
            genre = ""
        if not genre:
            try:
                from .genre import detect_genre_keywords
                text = " ".join(str(w.get("word", "")) for w in words)
                genre, _ = detect_genre_keywords(text)
            except Exception:
                genre = "motivation"

        from .overlay_plan import plan_overlays

        # PARITY: kalau klip SUDAH punya rencana (dibuat preview sebelumnya
        # atau oleh render), PAKAI itu — jangan panggil planner lagi. Planner
        # AI temperature 0.4 menghasilkan penempatan berbeda tiap panggilan,
        # jadi memanggilnya ulang = preview & hasil unduhan tidak sama.
        saved = clip.get("overlay_plan")
        if isinstance(saved, list) and saved and not body.refresh:
            print(f"[broll] pakai overlay_plan tersimpan: {len(saved)} item")
            return {"placements": saved, "genre": genre, "cached": True}

        placements = await plan_overlays(words, max(1.0, duration), genre=genre)

        # SIMPAN rencana ke klip → render unduhan memakai penempatan yang SAMA
        # (tanpa ini AI dipanggil 2x dan preview != hasil).
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                await client.patch(
                    f"{supabase_url}/rest/v1/clips?id=eq.{body.clip_id}",
                    json={"overlay_plan": placements},
                    headers={"apikey": supabase_anon_key,
                             "Authorization": f"Bearer {token}",
                             "Content-Type": "application/json"},
                )
        except Exception as exc:
            print(f"[broll] simpan overlay_plan gagal: {exc}")

        return {"placements": placements, "genre": genre}

    app.post("/api/broll/placements")(api_broll_placements)

    async def api_icon_png(icon_id: str):
        """PNG ikon katalog (dipakai preview) — aset identik dengan render."""
        from .icon_png import icon_png_from_id

        safe = "".join(ch for ch in icon_id if ch.isalnum() or ch == "-")
        if safe.endswith(".png"):
            safe = safe[:-4]
        path = icon_png_from_id(safe, 256)
        if not path:
            raise HTTPException(404, "Ikon tidak ditemukan")
        return FileResponse(
            path, media_type="image/png",
            headers={"Cache-Control": "public, max-age=31536000, immutable"},
        )

    app.get("/api/icons/{icon_id}")(api_icon_png)
