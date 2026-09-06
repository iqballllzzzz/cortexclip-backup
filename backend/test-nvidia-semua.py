#!/usr/bin/env python
"""Uji NYATA seluruh katalog model NVIDIA NIM (integrate.api.nvidia.com).

Sesuai permintaan pengguna: "pastiin puluhan model itu bekerja, dari model
pertama sampai terakhir". Mengambil /v1/models (katalog penuh), menembak
prompt kecil ke SETIAP model secara PARALEL (skill: serial 8×150s = 10 menit
tanpa hasil), lalu mencetak tabel mana yang hidup/mati.

Pakai: backend/.venv/bin/python backend/test-nvidia-semua.py
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

import httpx  # noqa: E402

BASE = "https://integrate.api.nvidia.com/v1"
KEY = os.getenv("NVIDIA_API_KEYS", "").split(",")[0].strip()

PROMPT = [{"role": "user", "content": 'Balas JSON saja: {"ok": true}'}]


async def uji_satu(c: httpx.AsyncClient, model: str,
                   sem: asyncio.Semaphore) -> dict:
    async with sem:
        t0 = time.time()
        try:
            r = await c.post(
                f"{BASE}/chat/completions",
                headers={"Authorization": f"Bearer {KEY}"},
                json={"model": model, "messages": PROMPT,
                      "max_tokens": 512, "temperature": 0},
                timeout=180.0)
            dt = time.time() - t0
            isi = ""
            if r.status_code == 200:
                try:
                    d = r.json()
                    isi = (d.get("choices") or [{}])[0].get(
                        "message", {}).get("content", "") or ""
                except Exception:
                    isi = ""
            return {"model": model, "status": r.status_code,
                    "hidup": r.status_code == 200 and len(isi.strip()) > 0,
                    "detik": round(dt, 1),
                    "isi": isi.strip()[:60]}
        except Exception as e:
            return {"model": model, "status": 0, "hidup": False,
                    "detik": round(time.time() - t0, 1),
                    "isi": f"{e.__class__.__name__}"}


async def main() -> int:
    if not KEY:
        print("NVIDIA_API_KEYS kosong")
        return 1
    async with httpx.AsyncClient() as c:
        r = await c.get(f"{BASE}/models",
                        headers={"Authorization": f"Bearer {KEY}"},
                        timeout=30.0)
        katalog = [m["id"] for m in r.json().get("data", [])]
    print(f"[nvidia] katalog: {len(katalog)} model")

    sem = asyncio.Semaphore(6)  # 40 RPM gratis → jangan banjir
    async with httpx.AsyncClient() as c:
        hasil = await asyncio.gather(*[
            uji_satu(c, m, sem) for m in katalog])

    hidup = [h for h in hasil if h["hidup"]]
    mati = [h for h in hasil if not h["hidup"]]
    print(f"\n[nvidia] HIDUP: {len(hidup)}/{len(katalog)}")
    for h in sorted(hidup, key=lambda x: x["detik"]):
        print(f"  ✓ {h['model']:58} {h['detik']:>6}s  {h['isi'][:40]}")
    print(f"\n[nvidia] MATI: {len(mati)}")
    for h in mati:
        print(f"  ✗ {h['model']:58} HTTP {h['status']}  {h['isi'][:40]}")

    # simpan untuk langkah berikut (pasang yang hidup ke hydra)
    with open("/tmp/nvidia-hidup.json", "w") as f:
        json.dump({"hidup": [h["model"] for h in hidup],
                   "mati": [h["model"] for h in mati]}, f)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
