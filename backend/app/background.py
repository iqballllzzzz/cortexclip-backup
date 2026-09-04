"""Tugas latar yang TIDAK IKUT MATI saat pengguna menutup halaman.

MASALAH YANG DIPERBAIKI
Sebelumnya main.py memanggil `asyncio.create_task(...)` dan membuang hasilnya.
Dokumentasi asyncio menyatakan eksplisit:

    "Save a reference to the result of this function, to avoid a task
     disappearing mid-execution. The event loop only keeps weak references
     to tasks."

Task tanpa referensi kuat BOLEH dikumpulkan garbage collector kapan saja —
dan GC paling sering terpicu justru ketika beban berubah: koneksi ditutup,
tab dimatikan, memori dilepas. Itu persis gejala yang dilaporkan pengguna:
"kalau penggunanya keluar dari website prosesnya berhenti".

Selain itu, task yang dibuat DI DALAM handler request bisa terbawa mati kalau
handler-nya dibatalkan saat klien memutus koneksi. `spawn()` di sini memakai
`asyncio.shield`-style pemisahan: task dijalankan sebagai task tingkat-loop
dengan referensi kuat di modul ini, jadi umurnya tidak terikat request.

CARA PAKAI
    from .background import spawn
    spawn(run_preview(), name=f"preview:{clip_id}")

Kalau `key` diberikan, pekerjaan yang sama tidak dijalankan dua kali:
`spawn(..., key="preview:abc")` mengembalikan task yang sudah jalan.
"""
from __future__ import annotations

import asyncio
import time
import traceback
from typing import Any, Awaitable, Optional

# Referensi KUAT — inti perbaikan. Selama task ada di sini, GC tidak akan
# menyentuhnya.
_hidup: set[asyncio.Task] = set()
# key -> task, untuk mencegah pekerjaan ganda (mis. dua tab minta preview sama)
_berkunci: dict[str, asyncio.Task] = {}
# catatan ringkas untuk diagnosa (endpoint /api/hydra/status & log)
_riwayat: list[dict[str, Any]] = []
MAKS_RIWAYAT = 60


def _catat(nama: str, status: str, mulai: float,
           err: Optional[str] = None) -> None:
    _riwayat.append({"nama": nama, "status": status,
                     "detik": round(time.time() - mulai, 1),
                     "error": err, "ts": time.time()})
    if len(_riwayat) > MAKS_RIWAYAT:
        del _riwayat[:-MAKS_RIWAYAT]


def spawn(coro: Awaitable[Any], *, name: str = "task",
          key: Optional[str] = None) -> asyncio.Task:
    """Jalankan `coro` di latar dengan umur LEPAS dari request pemanggil.

    - referensi kuat disimpan sampai selesai (anti-GC)
    - pengecualian DICATAT, bukan hilang senyap
    - `key` mencegah pekerjaan kembar
    """
    if key and key in _berkunci:
        t_lama = _berkunci[key]
        if not t_lama.done():
            # sudah jalan — tutup coroutine baru supaya tidak jadi peringatan
            # "coroutine was never awaited"
            try:
                coro.close()  # type: ignore[attr-defined]
            except Exception:
                pass
            return t_lama

    mulai = time.time()

    async def _bungkus() -> Any:
        try:
            hasil = await coro
            _catat(name, "selesai", mulai)
            return hasil
        except asyncio.CancelledError:
            _catat(name, "dibatalkan", mulai)
            raise
        except Exception as exc:
            _catat(name, "gagal", mulai, f"{exc.__class__.__name__}: {exc}"[:200])
            print(f"[background] {name} GAGAL: {exc.__class__.__name__}: {exc}")
            traceback.print_exc()
            return None

    tugas = asyncio.get_event_loop().create_task(_bungkus(), name=name)
    _hidup.add(tugas)
    if key:
        _berkunci[key] = tugas

    def _bersihkan(t: asyncio.Task) -> None:
        _hidup.discard(t)
        if key and _berkunci.get(key) is t:
            _berkunci.pop(key, None)

    tugas.add_done_callback(_bersihkan)
    return tugas


def sedang_jalan(key: str) -> bool:
    t = _berkunci.get(key)
    return bool(t and not t.done())


def ringkasan() -> dict[str, Any]:
    """Untuk endpoint diagnosa: berapa task hidup & riwayat terakhir."""
    return {
        "hidup": len(_hidup),
        "nama_hidup": sorted(t.get_name() for t in _hidup if not t.done())[:20],
        "terkunci": sorted(k for k, t in _berkunci.items() if not t.done())[:20],
        "riwayat": _riwayat[-12:],
    }
