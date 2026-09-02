"""Status kemajuan preview klip — dibagi ke semua permintaan status.

Kenapa modul terpisah: dipakai oleh main.py (endpoint status) DAN render_clip.py
(pelapor kemajuan), jadi kalau ditaruh di salah satunya akan terjadi impor
melingkar.

Isinya sengaja hanya di MEMORI (bukan DB): kemajuan berubah beberapa kali per
detik dan tidak perlu bertahan setelah proses selesai. Nilai akhir (preview_url
+ preview_ready) tetap disimpan ke DB seperti sebelumnya.
"""
from __future__ import annotations

import time
from typing import Any

# clip_id -> {"pct": int, "tahap": str, "ts": float}
_state: dict[str, dict[str, Any]] = {}

MAX_AGE_S = 1800.0          # entri lebih tua dari ini dianggap basi


def set_progress(clip_id: str, pct: int, tahap: str) -> None:
    """Catat kemajuan preview satu klip (dipanggil dari proses render)."""
    _state[clip_id] = {"pct": max(0, min(100, int(pct))),
                       "tahap": tahap, "ts": time.time()}


def get_progress(clip_id: str) -> dict[str, Any] | None:
    """Kemajuan terakhir, atau None kalau tidak ada / sudah basi."""
    row = _state.get(clip_id)
    if not row:
        return None
    if time.time() - row["ts"] > MAX_AGE_S:
        _state.pop(clip_id, None)
        return None
    return {"pct": row["pct"], "tahap": row["tahap"]}


def clear_progress(clip_id: str) -> None:
    _state.pop(clip_id, None)
