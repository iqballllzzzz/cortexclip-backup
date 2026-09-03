"""Pra-render preview SEMUA klip segera setelah pipeline selesai.

MASALAH YANG DISELESAIKAN
Sampai sekarang preview baru dibuat saat pengguna MEMBUKA editor: analisis wajah
+ encode berjalan di depan mata pengguna, 40-60 detik per klip, dan kalau backend
mati di tengahnya (SEGV) polling status balas 502 dan persen beku di 4%.

Sekarang: begitu klip terdeteksi, semua preview dirender di belakang. Waktu
pengguna membuka editor, `preview_url` sudah ada → video langsung tampil.

DIJALANKAN BERURUTAN, SATU KLIP SEKALI.
Bukan paralel. VPS ini 4 core; analisis wajah memakai ~1 core penuh per klip dan
ffmpeg memakai sisanya. Dua render bersamaan membuat keduanya lambat dan
menghabiskan RAM, sementara pengguna lain kehilangan kemampuan memuat halaman.
Antrean global dengan semaphore=1 memastikan beban server tetap rata.
"""
from __future__ import annotations

import asyncio
import os
from typing import Any

import httpx

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

# satu render preview pada satu waktu di seluruh proses
_gerbang = asyncio.Semaphore(1)
# project yang sedang/sudah dijadwalkan, supaya tidak dobel
_dijadwalkan: set[str] = set()


async def _sb(method: str, path: str, json_body=None) -> Any:
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    h = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}",
         "Content-Type": "application/json", "Prefer": "return=representation"}
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.request(method, url, headers=h, json=json_body)
    if r.status_code >= 300:
        raise RuntimeError(f"supabase {path}: {r.status_code} {r.text[:160]}")
    return r.json() if r.text else None


async def _render_satu(clip: dict[str, Any], project_id: str) -> bool:
    """Render preview satu klip. True kalau berhasil."""
    from .render_clip import render_preview_clip
    async with _gerbang:
        try:
            await render_preview_clip(project_id, clip["id"], token="")
            return True
        except Exception as exc:
            print(f"[prerender] klip {clip['id'][:8]} gagal: {str(exc)[:160]}")
            return False


async def prerender_project(project_id: str) -> None:
    """Render preview semua klip proyek ini, satu per satu, di belakang."""
    if project_id in _dijadwalkan:
        return
    _dijadwalkan.add(project_id)
    try:
        clips = await _sb("GET", f"clips?project_id=eq.{project_id}"
                                 "&select=id,start_time,end_time,preview_url"
                                 "&order=start_time.asc")
        perlu = [c for c in (clips or []) if not c.get("preview_url")]
        # preview_ready dinolkan lebih dulu untuk klip yang url-nya kosong: kalau
        # tidak, render_preview_clip menganggapnya cache hit dan tidak mengerjakan
        # apa pun (balik "OK" dalam 0 detik tanpa berkas).
        for c in perlu:
            try:
                await _sb("PATCH", f"clips?id=eq.{c['id']}",
                          json_body={"preview_ready": False})
            except Exception as exc:
                print(f"[prerender] reset flag {c['id'][:8]} gagal: {str(exc)[:80]}")
        print(f"[prerender] proyek {project_id[:8]}: {len(perlu)} klip "
              f"perlu preview (dari {len(clips or [])})")
        ok = 0
        for i, c in enumerate(perlu, 1):
            if await _render_satu(c, project_id):
                ok += 1
            print(f"[prerender] {i}/{len(perlu)} selesai (berhasil {ok})")
        print(f"[prerender] proyek {project_id[:8]} tuntas: {ok}/{len(perlu)}")
    except Exception as exc:
        print(f"[prerender] proyek {project_id[:8]} gagal: {str(exc)[:160]}")
    finally:
        _dijadwalkan.discard(project_id)


def jadwalkan(project_id: str) -> None:
    """Mulai pra-render tanpa menunggu (dipanggil dari pipeline).

    Sengaja tidak di-await: pipeline harus segera menandai proyek 'completed'
    supaya daftar klip muncul di UI; preview menyusul di belakang.
    """
    try:
        asyncio.get_running_loop().create_task(prerender_project(project_id))
    except RuntimeError:
        print("[prerender] tidak ada event loop, dilewati")
