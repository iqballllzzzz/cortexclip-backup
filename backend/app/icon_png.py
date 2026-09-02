"""Rasterisasi SVG ikon overlay (parity dengan preview) → PNG cache.

Ikon di RESULT diraster dari icon_svgs.py — SVG yang DIGENERATE dari
colored-icon.tsx, komponen yang sama persis dengan yang dirender preview.
"""
from __future__ import annotations

from pathlib import Path

CACHE_DIR = Path("/tmp/cortexclip_iconpng")


def icon_png_path(component: str, size: int = 512) -> str | None:
    """PNG path untuk komponen ikon (mis. 'MoneyIcon'), None kalau gagal."""
    try:
        import cairosvg

        from .icon_svgs import svg_document
    except Exception:
        return None
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    dest = CACHE_DIR / f"{component}_{size}.png"
    if dest.exists() and dest.stat().st_size > 200:
        return str(dest)
    try:
        cairosvg.svg2png(
            bytestring=svg_document(component, size).encode("utf-8"),
            write_to=str(dest),
            output_width=size,
            output_height=size,
        )
        return str(dest)
    except Exception:
        return None
