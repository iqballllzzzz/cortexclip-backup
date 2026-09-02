"""Robust launcher: load .env into os.environ BEFORE importing app, so child
processes (uvicorn workers) inherit the keys even when the parent shell env
is empty/stripped (e.g. when spawned from a process manager)."""
import os
from pathlib import Path

from dotenv import load_dotenv

HERE = Path(__file__).resolve().parent
load_dotenv(HERE / ".env", override=True)
print(f"[run.py] loaded .env from {HERE}. GROQ key: {bool(os.environ.get('GROQ_API_KEYS'))}")

if __name__ == "__main__":
    import uvicorn

    # timeout_graceful_shutdown WAJIB diisi. Default uvicorn = None = tunggu
    # request in-flight SELAMANYA. /api/render-clip & /api/transcribe jalan di
    # dalam request handler (bisa menit-an), jadi tiap `systemctl restart`
    # nyangkut sampai TimeoutStopSec systemd (90s) habis lalu SIGKILL —
    # "Failed with result 'timeout'" + ~90s downtime tiap deploy.
    # 15s: request pendek tetap selesai rapi, yang panjang di-cancel.
    # Render yang ikut ke-cancel sudah ditangani startup sweep watchdog
    # (job "rendering" → failed, user bisa render ulang).
    uvicorn.run("app.main:app", host="0.0.0.0", port=8787,
                timeout_graceful_shutdown=15)