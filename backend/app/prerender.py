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


async def _tunggu_sumber_di_storage(project_id: str, batas_s: float = 2400) -> bool:
    """Tunggu `projects.storage_path` terisi sebelum merender preview.

    KENAPA WAJIB: pipeline YouTube menjadwalkan pra-render tepat setelah klip
    tersimpan, sementara unggahan video sumber ke storage (termasuk kompres
    ffmpeg) masih berjalan di belakang. Saat `storage_path` masih NULL,
    `_source_seek_url()` balik None → `_ensure_source_local()` MENGUNDUH ULANG
    seluruh video dari YouTube untuk SETIAP klip. Terukur pada video 43 menit
    (600 MB): 10 klip × unduh penuh, antrean semaphore=1 → preview tidak pernah
    selesai dan pengguna melihat "memproses" yang persennya tidak bergerak.

    Dengan menunggu, satu berkas di storage dipakai bersama lewat HTTP range.
    """
    tunggu = 0.0
    while tunggu < batas_s:
        try:
            rows = await _sb("GET", f"projects?id=eq.{project_id}&select=storage_path")
            if rows and rows[0].get("storage_path"):
                if tunggu:
                    print(f"[prerender] sumber siap di storage setelah {tunggu:.0f}s")
                return True
        except Exception as exc:
            print(f"[prerender] cek storage_path gagal: {str(exc)[:80]}")
        await asyncio.sleep(10)
        tunggu += 10
    print(f"[prerender] proyek {project_id[:8]}: storage_path tidak muncul dalam "
          f"{batas_s:.0f}s — preview dilewati (akan dibuat saat editor dibuka)")
    return False


async def prerender_project(project_id: str) -> None:
    """Render preview semua klip proyek ini, satu per satu, di belakang."""
    if project_id in _dijadwalkan:
        return
    _dijadwalkan.add(project_id)
    try:
        if not await _tunggu_sumber_di_storage(project_id):
            return
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
