"""Resource limits & guard — VPS tetap sehat walau user banyak.

Kebijakan (kalibrasi VPS 4 CPU / 8GB RAM / 154GB disk):
- RENDER: max N render 1080p concurrent (ffmpeg masing2 ~1.2GB RAM + 1 CPU).
  Sisanya QUEUE — job pending otomatis diambil saat slot bebas.
- TRANSCRIBE: max N chunk transkripsi concurrent (AI gateway).
- DISK GUARD: render berhenti kalau sisa disk < threshold (cache aman).
- RAM GUARD: tolak job baru kalau available RAM < threshold.
- PER-USER: max job render aktif per user (anti spam 1 user monopoli).

Semua angka via env supaya bisa dituning tanpa ubah kode.
"""
from __future__ import annotations

import os
import shutil
import threading
from typing import Optional

# --- batas concurrent (env-override) ---
MAX_CONCURRENT_RENDERS = int(os.environ.get("MAX_CONCURRENT_RENDERS", "2"))
MAX_CONCURRENT_TRANSCRIBES = int(os.environ.get("MAX_CONCURRENT_TRANSCRIBES", "3"))

# --- guard resource (env-override) ---
MIN_FREE_DISK_GB = float(os.environ.get("MIN_FREE_DISK_GB", "5"))
MIN_FREE_RAM_GB = float(os.environ.get("MIN_FREE_RAM_GB", "1"))
MAX_JOBS_PER_USER = int(os.environ.get("MAX_JOBS_PER_USER", "6"))

_lock = threading.Lock()
_render_slots = threading.Semaphore(MAX_CONCURRENT_RENDERS)
_transcribe_slots = threading.Semaphore(MAX_CONCURRENT_TRANSCRIBES)
_active_renders: set[str] = set()   # job_id yang sedang render
_user_active: dict[str, int] = {}   # user_id → jumlah job aktif


def free_ram_gb() -> float:
    try:
        with open("/proc/meminfo") as f:
            info = {}
            for line in f:
                parts = line.split(":")
                if len(parts) == 2:
                    info[parts[0].strip()] = int(parts[1].strip().split()[0])
            avail_kb = info.get("MemAvailable", 0)
            return avail_kb / 1024 / 1024
    except Exception:
        return 8.0


def free_disk_gb() -> float:
    try:
        usage = shutil.disk_usage("/")
        return usage.free / 1024 / 1024 / 1024
    except Exception:
        return 100.0


def resource_status() -> dict:
    """Snapshot resource untuk admin/monitoring."""
    with _lock:
        return {
            "max_concurrent_renders": MAX_CONCURRENT_RENDERS,
            "max_concurrent_transcribes": MAX_CONCURRENT_TRANSCRIBES,
            "active_renders": len(_active_renders),
            "active_render_jobs": list(_active_renders),
            "free_ram_gb": round(free_ram_gb(), 2),
            "free_disk_gb": round(free_disk_gb(), 2),
            "min_free_disk_gb": MIN_FREE_DISK_GB,
            "min_free_ram_gb": MIN_FREE_RAM_GB,
            "max_jobs_per_user": MAX_JOBS_PER_USER,
        }


def can_accept_render(user_id: str) -> tuple[bool, str]:
    """Cek apakah job render baru boleh diterima. Return (ok, alasan)."""
    # disk penuh?
    if free_disk_gb() < MIN_FREE_DISK_GB:
        return False, f"Sisa penyimpanan server rendah ({free_disk_gb():.1f}GB) — coba lagi nanti."
    # RAM kritis?
    if free_ram_gb() < MIN_FREE_RAM_GB:
        return False, f"Memori server sedang tinggi — coba lagi beberapa saat."
    # spam per-user?
    with _lock:
        if _user_active.get(user_id, 0) >= MAX_JOBS_PER_USER:
            return False, f"Kamu punya {_user_active[user_id]} render aktif — tunggu salah satu selesai."
    return True, ""


class RenderSlot:
    """Context manager: klaim slot render (blocking dengan queue otomatis).

    Job menunggu di antrean sampai slot bebas — bukan ditolak — supaya
    semua job pasti selesai walau antri. Dipakai bersama can_accept_render.
    """

    def __init__(self, job_id: str, user_id: str):
        self.job_id = job_id
        self.user_id = user_id

    def __enter__(self) -> "RenderSlot":
        _render_slots.acquire()  # blocking — auto-queue
        with _lock:
            _active_renders.add(self.job_id)
            _user_active[self.user_id] = _user_active.get(self.user_id, 0) + 1
        return self

    def __exit__(self, *exc) -> None:
        with _lock:
            _active_renders.discard(self.job_id)
            n = _user_active.get(self.user_id, 1) - 1
            if n <= 0:
                _user_active.pop(self.user_id, None)
            else:
                _user_active[self.user_id] = n
        _render_slots.release()


class TranscribeSlot:
    """Context manager: batasi chunk transkripsi concurrent (AI gateway)."""

    def __enter__(self) -> "TranscribeSlot":
        _transcribe_slots.acquire()
        return self

    def __exit__(self, *exc) -> None:
        _transcribe_slots.release()
