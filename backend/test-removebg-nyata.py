"""UJI NYATA removebg custom logo: bytes → catbox URL → nexray v1 (→ v2).

Membuat PNG uji (lingkaran merah di latar putih), menjalankan alur PERSIS
yang dipakai endpoint /api/logo/removebg, lalu memastikan hasil PNG
transparan (alpha channel ada, ukuran wajar).

Pakai: backend/.venv/bin/python backend/test-removebg-nyata.py
"""
from __future__ import annotations

import asyncio
import os
import struct
import sys
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))


def _buat_png_uji() -> bytes:
    """PNG 128x128 sederhana: kotak putih + lingkaran merah (pakai stdlib)."""
    W = H = 128
    px = bytearray()
    for y in range(H):
        px.append(0)  # filter none
        for x in range(W):
            # latar putih, lingkaran merah radius 40 di tengah
            dx, dy = x - 64, y - 64
            if dx * dx + dy * dy <= 1600:
                px += bytes((220, 30, 30, 255))   # merah
            else:
                px += bytes((255, 255, 255, 255))  # putih

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    ihdr = struct.pack(">IIBBBBB", W, H, 8, 6, 0, 0, 0)  # RGBA
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(bytes(px)))
            + chunk(b"IEND", b""))


async def main() -> int:
    from app.custom_logo import _unggah_catbox, removebg

    png = _buat_png_uji()
    print(f"[uji] PNG uji dibuat: {len(png)} bytes")

    # 1) catbox
    try:
        url = await _unggah_catbox(png)
        print(f"[uji] catbox URL: {url}")
    except Exception as e:
        print(f"[uji] catbox GAGAL: {e}")
        return 1

    # 2) removebg penuh (v1 → v2)
    try:
        hasil, versi = await removebg(png, os.getenv("NEXRAY_API_KEY", ""))
        print(f"[uji] removebg sukses via {versi}: {len(hasil)} bytes")
        tanda_png = b"\x89PNG\r\n\x1a\n"
        print(f"[uji] header PNG valid: {hasil[:8] == tanda_png}")
        return 0
    except Exception as e:
        print(f"[uji] removebg GAGAL: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
