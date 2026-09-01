"""Twemoji helper — unduh & cache PNG emoji per codepoint.

Dipakai untuk overlay ikon & b-roll di render final (PNG overlay via ffmpeg,
bukan ASS font emoji yang tidak andal antar mesin).
"""
from __future__ import annotations

import hashlib
import os
from pathlib import Path

import httpx

CACHE_DIR = Path(os.environ.get("TWEMOJI_CACHE", "/tmp/cortexclip_twemoji"))
CDN = "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/{code}.png"


def emoji_to_codepoint(emoji: str) -> str:
    """'💵' → '1f4b5' (VS16 & skin-tone dihapus agar cocok asset Twemoji)."""
    codes = []
    for ch in emoji:
        cp = ord(ch)
        if cp in (0xFE0F, 0x200D):   # variation selector & ZWJ
            continue
        if 0x1F3FB <= cp <= 0x1F3FF:  # skin tone modifiers
            continue
        codes.append(f"{cp:x}")
    return "-".join(codes)


def twemoji_png(emoji: str) -> str | None:
    """Return path PNG lokal untuk emoji, atau None kalau gagal."""
    code = emoji_to_codepoint(emoji)
    if not code:
        return None
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    dest = CACHE_DIR / f"{code}.png"
    if dest.exists() and dest.stat().st_size > 200:
        return str(dest)
    url = CDN.format(code=code)
    try:
        with httpx.Client(timeout=30, follow_redirects=True) as client:
            r = client.get(url)
        if r.status_code != 200 or len(r.content) < 200:
            return None
        dest.write_bytes(r.content)
        return str(dest)
    except Exception:
        return None


def cache_key(parts: list) -> str:
    return hashlib.md5("|".join(str(p) for p in parts).encode()).hexdigest()[:10]
