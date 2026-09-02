"""B-roll video: unduh + cache klip stock (Mixkit) untuk overlay PiP di render.

Preview browser memutar URL yang sama lewat <video> PiP, jadi hasil unduhan
dan preview memperlihatkan b-roll yang identik (parity).
"""
from __future__ import annotations

import hashlib
import os
from pathlib import Path

import httpx

CACHE_DIR = Path(os.environ.get("BROLL_CACHE", "/tmp/cortexclip_broll"))
MAX_BYTES = 25 * 1024 * 1024   # jangan sedot file raksasa di VPS
TIMEOUT = 45


def broll_local_path(url: str) -> str | None:
    """Unduh (sekali) b-roll ke cache lokal; None kalau gagal/kegedean."""
    if not url or not url.startswith("http"):
        return None
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    key = hashlib.md5(url.encode()).hexdigest()[:14]
    dest = CACHE_DIR / f"{key}.mp4"
    if dest.exists() and dest.stat().st_size > 10_000:
        return str(dest)
    tmp = dest.with_suffix(".part")
    try:
        with httpx.stream("GET", url, timeout=TIMEOUT, follow_redirects=True) as r:
            if r.status_code != 200:
                return None
            size = 0
            with open(tmp, "wb") as f:
                for chunk in r.iter_bytes(65536):
                    size += len(chunk)
                    if size > MAX_BYTES:
                        raise ValueError("broll terlalu besar")
                    f.write(chunk)
        if size < 10_000:
            raise ValueError("broll terlalu kecil")
        tmp.replace(dest)
        return str(dest)
    except Exception:
        try:
            tmp.unlink(missing_ok=True)
        except Exception:
            pass
        return None
