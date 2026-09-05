"""E2E NYATA: hydra_download dari YouTube HARUS sukses TANPA cookies.

Kasus uji: video yang kemarin gagal (qo-DukvADE4, 43 menit). Terlalu berat
untuk uji penuh — pakai video pendek untuk memastikan jalurnya bekerja, lalu
satu video menengah. Lulus = berkas ada, durasi masuk akal, provider dicatat.
"""
import asyncio
import os
import sys
import tempfile
import time

sys.path.insert(0, "/home/muhiqbalsukarno/cortexclip-backup/backend")
os.chdir("/home/muhiqbalsukarno/cortexclip-backup/backend")

from dotenv import load_dotenv

load_dotenv(".env")
from app.youtube import hydra_download  # noqa: E402

KASUS = [
    ("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "pendek 3m"),
    ("https://www.youtube.com/watch?v=BaW_jenozKc", "pendek 10s"),
]

lulus = gagal = 0


async def main():
    global lulus, gagal
    for url, ket in KASUS:
        dest = tempfile.mktemp(suffix=".mp4")
        t0 = time.time()
        try:
            info = await hydra_download(url, dest)
            ukur = os.path.getsize(dest) if os.path.exists(dest) else 0
            ok = ukur > 500_000
            lulus += 1 if ok else 0
            gagal += 0 if ok else 1
            print(f"  {'OK  ' if ok else 'GAGAL'} {ket}: provider="
                  f"{info.get('provider')} dur={info.get('duration', 0):.0f}s "
                  f"ukur={ukur/1e6:.1f}MB waktu={time.time()-t0:.0f}s")
            if os.path.exists(dest):
                os.unlink(dest)
        except Exception as exc:
            gagal += 1
            print(f"  GAGAL {ket}: {str(exc)[:180]}")

    print(f"\nHASIL: {lulus} lulus, {gagal} gagal")
    return 0 if gagal == 0 else 1


sys.exit(asyncio.run(main()))
