"""Endpoint jalur kamera: dipakai editor untuk membingkai video SUMBER di browser.

Kenapa ini menghapus penungguan preview sepenuhnya: editor sudah memutar video
sumber (HTTP range seek) sejak detik pertama. Yang salah cuma BINGKAINYA — browser
melakukan crop tengah, dan pada podcast dua orang tengah frame justru ruang kosong
di antara mereka. Kalau posisi kamera dikirim sebagai angka, browser bisa menggeser
crop-nya sendiri lewat CSS transform: framing benar TANPA menunggu render server.

Dua tingkat:
  quick  — satu offset x (2-4 detik). Dikirim lebih dulu supaya bingkai langsung benar.
  full   — x[] per frame + cuts (hasil analisis 15 fps yang sudah ada), disimpan di
           clips.camera_track lalu dipakai baik oleh browser maupun render.
"""
from __future__ import annotations

import asyncio
import json
from typing import Any, Optional

import httpx

_quick_tasks: dict[str, asyncio.Task] = {}
_full_tasks: dict[str, asyncio.Task] = {}


async def _sb_get(supabase_url: str, key: str, path: str) -> Any:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(f"{supabase_url}/rest/v1/{path}",
                        headers={"apikey": key, "Authorization": f"Bearer {key}"})
    return r.json() if r.status_code == 200 else []


async def _sb_patch(supabase_url: str, key: str, path: str, body: dict) -> None:
    async with httpx.AsyncClient(timeout=30) as c:
        await c.patch(f"{supabase_url}/rest/v1/{path}",
                      headers={"apikey": key, "Authorization": f"Bearer {key}",
                               "Content-Type": "application/json"}, json=body)


def _pack_full(st: dict[str, Any], src_w: int, src_h: int,
               crop_w: int) -> dict[str, Any]:
    traj = st.get("trajectory") or []
    return {
        "fps": float(st.get("analysis_fps") or 15.0),
        "src_w": src_w, "src_h": src_h, "crop_w": crop_w,
        "x": [round(float(v), 1) for v in traj],
        "cuts": [int(c) for c in (st.get("cuts") or [])],
        "faces": int(st.get("faces") or 0),
        "quick": False,
    }


async def get_or_build(clip_id: str, *, supabase_url: str, service_key: str,
                       source_url_for: Any, render_mod: Any) -> dict[str, Any]:
    """Balik jalur kamera untuk satu klip. Cepat: pakai cache kalau ada.

    source_url_for(project) -> URL sumber yang bisa di-seek lewat HTTP.
    """
    rows = await _sb_get(
        supabase_url, service_key,
        f"clips?id=eq.{clip_id}&select=start_time,end_time,camera_track,project_id")
    if not rows:
        return {"error": "klip tidak ditemukan"}
    clip = rows[0]
    cached = clip.get("camera_track")
    if isinstance(cached, str):
        try:
            cached = json.loads(cached)
        except ValueError:
            cached = None

    # cache penuh → langsung pakai
    if isinstance(cached, dict) and cached.get("x") and not cached.get("quick"):
        cached["cached"] = True
        return cached

    projs = await _sb_get(supabase_url, service_key,
                          f"projects?id=eq.{clip['project_id']}"
                          "&select=id,storage_path,user_id")
    if not projs:
        return {"error": "project tidak ditemukan"}
    project = projs[0]
    src = await source_url_for(project)
    if not src:
        return {"error": "sumber video tidak tersedia"}

    start = float(clip["start_time"])
    end = float(clip["end_time"])

    from anyio import to_thread

    # analisis PENUH di belakang (sekali per klip) — hasilnya menimpa cache quick
    async def full():
        try:
            st = await to_thread.run_sync(
                lambda: render_mod.analyze_speaker_track(src, start, end))
            w, h = await to_thread.run_sync(lambda: render_mod.probe_size(src))
            crop_w = min(int(h * 9 / 16), w)
            data = _pack_full(st, w, h, crop_w)
            if data["x"]:
                await _sb_patch(supabase_url, service_key,
                                f"clips?id=eq.{clip_id}",
                                {"camera_track": data})
                print(f"[camera-track] penuh disimpan: {len(data['x'])} titik, "
                      f"{len(data['cuts'])} potongan")
        except Exception as exc:
            print(f"[camera-track] analisis penuh gagal: {exc}")
        finally:
            _full_tasks.pop(clip_id, None)

    if clip_id not in _full_tasks or _full_tasks[clip_id].done():
        _full_tasks[clip_id] = asyncio.create_task(full())

    # cache quick → pakai sambil menunggu yang penuh
    if isinstance(cached, dict) and cached.get("static_x"):
        cached["cached"] = True
        return cached

    # belum ada apa pun: hitung quick SEKARANG (2-4 detik)
    from .camera_quick import quick_track
    q = await to_thread.run_sync(
        lambda: quick_track(src, start, end, probe_size=render_mod.probe_size,
                            run_ffmpeg=render_mod.run_ffmpeg))
    if not q:
        return {"error": "gagal menghitung jalur kamera"}
    await _sb_patch(supabase_url, service_key, f"clips?id=eq.{clip_id}",
                    {"camera_track": q})
    q["cached"] = False
    return q
