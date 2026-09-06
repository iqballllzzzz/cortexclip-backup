#!/usr/bin/env python
"""Bukti FAILOVER BERANTAI sesuai permintaan pengguna:

"failover juga bekerja dari yang pertama, kedua, ketiga, seterusnya"

Resep dari skill cortexclip (teruji):
  1. Set cooldown 600s untuk endpoint provider prioritas terdepan.
  2. Cetak urutan gateway._pool(audio=False) — argumen audio WAJIB diisi.
  3. Jalankan gateway.chat() NYATA — prompt kecil.
  4. Pastikan pemenang (gateway.last_chat_model) BUKAN provider yang
     dicooldown; ulangi 3x → bukti rantai 1 → 2 → 3.

Pakai: backend/.venv/bin/python backend/test-failover-rantai.py
"""
from __future__ import annotations

import asyncio
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

from app.hydra import gateway  # noqa: E402


def urutan_pool() -> list[str]:
    return [e.provider for e in gateway._pool(audio=False)]


def bekukan(provider: str, detik: float = 600.0) -> int:
    n = 0
    for e in gateway._endpoints:
        if e.provider == provider:
            e.cooldown_until = time.time() + detik
            n += 1
    print(f"  [cooldown] {provider}: {n} endpoint dibekukan {detik:.0f}s")
    return n


async def main() -> int:
    rantai: list[str] = []
    print("[failover] urutan pool awal (5 pertama):", urutan_pool()[:5])

    for langkah in range(1, 4):
        # KETAT: bekukan provider TERDEPAN persis (pool[0]) — kalau itu
        # pemenang sebelumnya, dia ikut dibekukan → rantai benar turun.
        urut = urutan_pool()
        if not urut:
            print("  pool kosong — berhenti")
            break
        pertama = urut[0]
        print(f"\n[langkah {langkah}] bekukan provider terdepan: {pertama}")
        bekukan(pertama)
        urut2 = urutan_pool()
        print(f"  urutan pool sekarang (5 pertama): {urut2[:5]}")

        t0 = time.time()
        try:
            isi = await gateway.chat(
                [{"role": "user", "content": 'Balas JSON: {"ok": true}'}],
                max_tokens=512, timeout=120.0)
        except Exception as exc:
            print(f"  chat gagal total: {exc}")
            return 1
        dt = time.time() - t0
        pemenang = (gateway.last_chat_model or "?").split("/")[0]
        print(f"  chat nyata ({dt:.1f}s) → pemenang: "
              f"{gateway.last_chat_model} | isi: {str(isi)[:50]}")

        if pemenang == pertama:
            print("  ✗ GAGAL: pemenang masih provider yang dibekukan!")
            return 1
        if pemenang in rantai:
            print(f"  ! pemenang berulang ({pemenang}) — provider itu punya "
                  "banyak endpoint; tetap failover valid (model beda)")
        rantai.append(pemenang)
        print(f"  ✓ failover bekerja — rantai: {' → '.join(rantai)}")

    print(f"\n[failover] RANTAI TERBUKTI: {' → '.join(rantai)}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
