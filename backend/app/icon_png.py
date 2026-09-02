"""Rasterisasi SVG ikon overlay (parity dengan preview) → PNG cache.

Ikon di RESULT diraster dari icon_svgs.py — SVG yang DIGENERATE dari
colored-icon.tsx, komponen yang sama persis dengan yang dirender preview.
"""
from __future__ import annotations

from pathlib import Path

CACHE_DIR = Path("/tmp/cortexclip_iconpng")


def icon_png_path(component: str, size: int = 512, variant: str = "") -> str | None:
    """PNG path untuk komponen ikon (mis. 'MoneyIcon'), None kalau gagal.

    variant: sufiks warna dari icon_catalog (mis. '-blue') → artwork sama
    dengan warna berbeda, supaya katalog 500+ tetap 1 sumber SVG.
    """
    try:
        import cairosvg

        from .icon_svgs import svg_document
    except Exception:
        return None
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    dest = CACHE_DIR / f"{component}{variant}_{size}.png"
    if dest.exists() and dest.stat().st_size > 200:
        return str(dest)
    try:
        svg = svg_document(component, size)
        if variant:
            from .icon_catalog import variant_svg
            svg = variant_svg(svg, variant)
        cairosvg.svg2png(
            bytestring=svg.encode("utf-8"),
            write_to=str(dest),
            output_width=size,
            output_height=size,
        )
        return str(dest)
    except Exception:
        return None


def icon_png_from_id(icon_id: str, size: int = 512) -> str | None:
    """PNG dari id katalog ('MoneyIcon-blue' / 'StarIcon')."""
    try:
        from .icon_catalog import parse_id
    except Exception:
        return icon_png_path(icon_id, size)
    comp, variant = parse_id(icon_id)
    return icon_png_path(comp, size, variant)
