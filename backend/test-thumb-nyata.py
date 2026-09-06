#!/usr/bin/env python
"""Uji NYATA pembuatan thumbnail klip: ffmpeg range-read → JPG → probe.

Menjalankan jalur produksi (clip_thumb.pastikan_thumb) pada klip nyata di DB,
lalu MEMBUKTIKAN hasilnya dengan ffprobe: dimensi 405x720 (9:16), berkas > 5KB,
dan frame TIDAK hitam total (rata-rata luminance > 8).

Unit test yang hanya memeriksa string pernah meloloskan bug ke produksi
(build_sendcmd_file), jadi di sini ffmpeg benar-benar dijalankan.

Pakai: backend/.venv/bin/python backend/test-thumb-nyata.py
"""

from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

import httpx  # noqa: E402

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE = os.environ["SUPABASE_SERVICE_KEY"]
H = {"apikey": SERVICE, "Authorization": f"Bearer {SERVICE}"}

lulus, gagal = 0, 0


def cek(nama: str, ok: bool, detail: str = "") -> None:
    global lulus, gagal
    if ok:
        lulus += 1
        print(f"  [OK]   {nama}")
    else:
        gagal += 1
        print(f"  [GAGAL] {nama}: {detail}")


def probe(path: str) -> dict:
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "json", path],
        capture_output=True, text=True, check=True)
    return json.loads(r.stdout)["streams"][0]


def luminance(path: str) -> float:
    """Rata-rata terang frame (0-255) — mendeteksi thumbnail hitam total."""
    r = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-vf",
         "format=gray,scale=32:32", "-f", "rawvideo", "-"],
        capture_output=True, check=True)
    data = r.stdout
    return sum(data) / max(1, len(data))


async def main() -> int:
    print("=== UJI THUMBNAIL KLIP (ffmpeg nyata) ===\n")

    # 1. cari klip nyata pada proyek yang punya storage_path
    async with httpx.AsyncClient(timeout=30) as c:
        rp = await c.get(
            f"{SUPABASE_URL}/rest/v1/projects?storage_path=not.is.null"
            "&select=id,user_id,storage_path&limit=5", headers=H)
        proyek = rp.json()
    if not proyek:
        print("Tidak ada proyek dengan storage_path — tidak bisa diuji.")
        return 1

    target = None
    for p in proyek:
        async with httpx.AsyncClient(timeout=30) as c:
            rc = await c.get(
                f"{SUPABASE_URL}/rest/v1/clips?project_id=eq.{p['id']}"
                "&select=id,start_time,end_time&limit=1", headers=H)
        klip = rc.json()
        if klip:
            target = (p, klip[0])
            break
    if not target:
        print("Tidak ada klip pada proyek ber-storage.")
        return 1

    proyek_row, klip_row = target
    clip_id = str(klip_row["id"])
    print(f"klip uji: {clip_id}  ({klip_row['start_time']:.0f}s"
          f"–{klip_row['end_time']:.0f}s)")
    print(f"proyek  : {proyek_row['id']}\n")

    from app.clip_thumb import pastikan_thumb  # noqa: E402
    from app.render_clip import _source_seek_url  # noqa: E402

    # 2. jalankan jalur produksi, PAKSA supaya benar-benar merender
    hasil = await pastikan_thumb(clip_id, str(proyek_row["user_id"]),
                                 source_url_for=_source_seek_url, paksa=True)
    print(f"hasil: {hasil}\n")
    cek("pastikan_thumb() ok", bool(hasil.get("ok")), str(hasil))
    cek("URL thumbnail dikembalikan", bool(hasil.get("url")))
    cek("bukan cache (benar-benar dirender)", hasil.get("cached") is False)
    if not hasil.get("url"):
        print(f"\nHASIL: {lulus} lulus, {gagal} gagal")
        return 1

    # 3. unduh berkas hasil & buktikan isinya
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.get(hasil["url"])
    cek("berkas thumbnail bisa diunduh (HTTP 200)", r.status_code == 200,
        f"status {r.status_code}")
    lokal = "/tmp/uji-thumb.jpg"
    with open(lokal, "wb") as f:
        f.write(r.content)
    size = os.path.getsize(lokal)
    cek("ukuran > 5KB (bukan berkas kosong)", size > 5000, f"{size} byte")

    st = probe(lokal)
    cek("lebar 405 px", st["width"] == 405, str(st["width"]))
    cek("tinggi 720 px", st["height"] == 720, str(st["height"]))
    rasio = st["width"] / st["height"]
    cek("rasio 9:16 (±0.01)", abs(rasio - 9 / 16) < 0.01, f"{rasio:.4f}")

    lum = luminance(lokal)
    cek("frame TIDAK hitam total (luminance > 8)", lum > 8, f"lum={lum:.1f}")
    print(f"       (luminance rata-rata: {lum:.1f}/255, ukuran {size/1024:.0f}KB)")

    # 4. kolom DB terisi
    async with httpx.AsyncClient(timeout=30) as c:
        rr = await c.get(f"{SUPABASE_URL}/rest/v1/clips?id=eq.{clip_id}"
                         "&select=thumb_url", headers=H)
    db_url = (rr.json() or [{}])[0].get("thumb_url")
    cek("clips.thumb_url tersimpan di DB", db_url == hasil["url"], str(db_url))

    # 5. panggilan kedua HARUS memakai cache (idempoten, tidak render ulang)
    ulang = await pastikan_thumb(clip_id, str(proyek_row["user_id"]),
                                 source_url_for=_source_seek_url)
    cek("panggilan kedua memakai cache", ulang.get("cached") is True, str(ulang))

    print(f"\nHASIL: {lulus} lulus, {gagal} gagal")
    return 0 if gagal == 0 else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
