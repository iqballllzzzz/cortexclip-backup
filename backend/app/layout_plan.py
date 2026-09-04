"""Jembatan AUTO LAYOUT: dari hasil analisis wajah ke daftar segmen siap render.

Satu tempat, dipakai render unduhan MAUPUN preview, supaya keduanya tidak pernah
menghasilkan layout berbeda (janji "preview = hasil unduhan").

Pilihan layout pengguna disimpan di clips.layout_prefs:
    {"enabled": bool, "layouts": ["fill","split",...]}
`enabled` false → daftar segmen kosong → render memakai fill seperti biasa.
`layouts` kosong / memuat semua → mode CERDAS (sistem memilih sendiri).
"""
from __future__ import annotations

from typing import Any, Optional

from . import auto_layout as AL
from .layout_render import posisi_panel, posisi_panel_base

N_PANEL = {AL.SPLIT: 2, AL.THREE: 3, AL.FOUR: 4}


def segmen_untuk(analisis: dict[str, Any],
                 prefs: Optional[dict[str, Any]]) -> list[dict[str, Any]]:
    """Balik daftar segmen layout (kosong = pakai fill saja).

    analisis: hasil face_pipeline.analyze() — perlu `layout_frames` &
    `analysis_fps`, opsional `trajectory` + dimensi sumber untuk pemetaan
    posisi ke ruang base.
    prefs: clips.layout_prefs.
    """
    if not prefs or not prefs.get("enabled"):
        return []
    frames = analisis.get("layout_frames") or []
    if not frames:
        return []
    fps = float(analisis.get("analysis_fps") or 15.0)
    traj = analisis.get("trajectory") or None
    src_w = int(analisis.get("src_w") or 0)
    crop_w = int(analisis.get("crop_w") or 0)
    ada_pemetaan = bool(traj and src_w and crop_w)
    pilihan = [str(x) for x in (prefs.get("layouts") or []) if x]
    # kosong atau semua dicentang = mode cerdas (biarkan planner memilih)
    diizinkan = None if (not pilihan or len(pilihan) >= len(AL.SEMUA_LAYOUT)) else pilihan
    seg = AL.rencana_layout(
        frames, fps,
        diizinkan=diizinkan,
        punya_screenshare=bool(prefs.get("has_screenshare")),
        punya_gameplay=bool(prefs.get("has_gameplay")),
    )
    # isi posisi panel untuk layout multi-panel. Kalau trajektori tersedia,
    # posisi dipetakan ke RUANG BASE (frame hasil face tracking) — panel
    # memotong base, jadi koordinatnya harus di ruang yang sama.
    for s in seg:
        lay = str(s.get("layout") or "")
        n = N_PANEL.get(lay)
        if n:
            # panel memotong SUMBER → posisi ruang sumber (posisi_panel)
            s["positions"] = posisi_panel(frames, fps, s, n)
        elif lay in (AL.GAMEPLAY, AL.SCREENSHARE):
            s["positions"] = posisi_panel(frames, fps, s, 1)
    return seg


def ringkas_teks(seg: list[dict[str, Any]]) -> str:
    """Satu baris untuk log: layout apa saja dan berapa lama."""
    if not seg:
        return "fill (tanpa auto layout)"
    r = AL.ringkas(seg)
    return ", ".join(f"{k} {v:.1f}s" for k, v in sorted(r.items()))
