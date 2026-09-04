"""API AUTO LAYOUT: simpan pilihan pengguna & pratinjau rencana layout.

Dua endpoint:
  PUT  /api/layout-prefs/{clip_id}   simpan {"enabled":bool,"layouts":[...]}
                                     → INVALIDASI preview supaya dirender ulang
  GET  /api/layout-plan/{clip_id}    rencana segmen (untuk ditampilkan di editor)

Kenapa menyimpan pilihan MEMBATALKAN preview: layout ikut dibakar ke berkas
preview (supaya preview == unduhan). Kalau preview lama dibiarkan, pengguna
mencentang "split" tapi videonya tidak berubah sampai render berikutnya — bug
yang sudah pernah terjadi dengan cache preview.
"""
from __future__ import annotations

import os
from typing import Any, Optional

import httpx

from .auto_layout import SEMUA_LAYOUT

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")


def _headers() -> dict[str, str]:
    return {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "application/json"}


async def _sb(method: str, path: str, **kw) -> Any:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.request(method, f"{SUPABASE_URL}/rest/v1/{path}",
                            headers={**_headers(), "Prefer": "return=representation"},
                            **kw)
        if r.status_code >= 300:
            raise RuntimeError(f"supabase {r.status_code}: {r.text[:200]}")
        try:
            return r.json()
        except Exception:
            return None


def bersihkan_prefs(body: dict[str, Any]) -> dict[str, Any]:
    """Validasi masukan pengguna. Layout tak dikenal DIBUANG, bukan diteruskan.

    Meneruskan nama layout asing ke perencana berarti nama itu ikut jadi kunci
    `diizinkan` dan menghasilkan rencana yang tidak bisa dirender.
    """
    layouts = [str(x) for x in (body.get("layouts") or [])
               if str(x) in SEMUA_LAYOUT]
    return {
        "enabled": bool(body.get("enabled")),
        "layouts": layouts,
        "has_screenshare": bool(body.get("has_screenshare")),
        "has_gameplay": bool(body.get("has_gameplay")),
    }


async def simpan_prefs(clip_id: str, user_id: str,
                       body: dict[str, Any]) -> dict[str, Any]:
    """Simpan layout_prefs milik klip ini + batalkan preview lama."""
    rows = await _sb("GET", f"clips?id=eq.{clip_id}&select=id,user_id,layout_prefs")
    if not rows:
        raise RuntimeError("klip tidak ditemukan")
    if str(rows[0].get("user_id")) != str(user_id):
        raise RuntimeError("bukan milik pengguna ini")

    prefs = bersihkan_prefs(body)
    lama = rows[0].get("layout_prefs") or {}
    berubah = (bool(lama.get("enabled")) != prefs["enabled"]
               or sorted(lama.get("layouts") or []) != sorted(prefs["layouts"]))

    patch: dict[str, Any] = {"layout_prefs": prefs}
    if berubah:
        # preview lama memakai layout lama → harus dibuat ulang
        patch.update({"preview_url": None, "preview_ready": False})
    await _sb("PATCH", f"clips?id=eq.{clip_id}", json=patch)
    return {"ok": True, "layout_prefs": prefs, "preview_direset": berubah}


async def rencana(clip_id: str, user_id: str, *, render_mod,
                  source_url_for) -> dict[str, Any]:
    """Rencana segmen layout untuk klip ini (tanpa merender).

    Memakai camera_track kalau sudah ada supaya tidak menganalisis dua kali.
    """
    rows = await _sb(
        "GET",
        f"clips?id=eq.{clip_id}"
        "&select=id,user_id,project_id,start_time,end_time,layout_prefs,camera_track")
    if not rows:
        raise RuntimeError("klip tidak ditemukan")
    clip = rows[0]
    if str(clip.get("user_id")) != str(user_id):
        raise RuntimeError("bukan milik pengguna ini")

    ct = clip.get("camera_track") or {}
    frames = ct.get("layout_frames") or []
    fps = float(ct.get("analysis_fps") or 15.0)
    if not frames:
        proj = await _sb("GET", f"projects?id=eq.{clip['project_id']}"
                                "&select=id,storage_path,user_id")
        if not proj:
            raise RuntimeError("proyek tidak ditemukan")
        url = await source_url_for(proj[0])
        if not url:
            raise RuntimeError("sumber video tidak tersedia")
        st = render_mod.analyze_speaker_track(
            url, float(clip["start_time"]), float(clip["end_time"]))
        frames = st.get("layout_frames") or []
        fps = float(st.get("analysis_fps") or 15.0)
        # simpan supaya panggilan berikutnya instan
        try:
            await _sb("PATCH", f"clips?id=eq.{clip_id}",
                      json={"camera_track": {**(ct or {}), **st}})
        except Exception as exc:
            print(f"[layout] simpan camera_track gagal (lanjut): {exc}")

    from . import layout_plan
    seg = layout_plan.segmen_untuk({"layout_frames": frames, "analysis_fps": fps},
                                   clip.get("layout_prefs")
                                   or {"enabled": True, "layouts": []})
    from .auto_layout import ringkas
    return {"segments": seg, "ringkas": ringkas(seg),
            "layout_prefs": clip.get("layout_prefs") or {}}
