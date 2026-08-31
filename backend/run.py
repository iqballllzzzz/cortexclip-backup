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

    uvicorn.run("app.main:app", host="0.0.0.0", port=8787)