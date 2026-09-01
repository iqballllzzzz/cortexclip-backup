"""HF Space STT (gradio) — whisper-large-v3 gratis via huggingface space.
Hydra tier baru: Groq (kadaluarsa) → Gemini (rate-limit kecil) → HF Space (gratis)
→ lokal whisper (jurus pamungkas)."""
from __future__ import annotations

import os
import json
import time
import asyncio
import tempfile
import subprocess
from typing import Any, Optional

import httpx

HF_SPACE = os.environ.get("HF_STT_SPACE", "https://hf-audio-whisper-large-v3.hf.space")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126 Safari/537.36"


def _to_mp3(wav_bytes: bytes) -> bytes:
    """Kompres wav → mp3 64k mono (hemat upload & space menerima mp3)."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        f.write(wav_bytes)
        wav_p = f.name
    mp3_p = wav_p + ".mp3"
    try:
        subprocess.run(["ffmpeg", "-y", "-i", wav_p, "-vn", "-ac", "1", "-ar", "16000",
                        "-b:a", "64k", mp3_p], check=True, capture_output=True, timeout=300)
        return open(mp3_p, "rb").read()
    finally:
        for p in (wav_p, mp3_p):
            try:
                os.unlink(p)
            except OSError:
                pass


async def hf_transcribe(wav_bytes: bytes) -> Optional[dict[str, Any]]:
    """Transcribe via HF Space gradio API. Return dict ala Groq:
    {"segments": [...], "text": "..."} dengan timestamp per segmen (chunks)."""
    mp3 = await asyncio.to_thread(_to_mp3, wav_bytes)
    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
        # 1) upload file
        r = await client.post(f"{HF_SPACE}/gradio_api/upload",
                              files={"files": ("chunk.mp3", mp3, "audio/mp3")},
                              headers={"user-agent": UA})
        if r.status_code != 200:
            print(f"[hf-stt] upload gagal: {r.status_code} {r.text[:120]}")
            return None
        paths = r.json()
        if not paths:
            print("[hf-stt] upload kosong")
            return None
        file_data = {"path": paths[0], "meta": {"_type": "gradio.FileData"}}

        # 2) submit job
        r = await client.post(f"{HF_SPACE}/gradio_api/call/transcribe",
                              json={"data": [file_data, "transcribe"]},
                              headers={"user-agent": UA, "Content-Type": "application/json"})
        if r.status_code != 200:
            print(f"[hf-stt] submit gagal: {r.status_code} {r.text[:120]}")
            return None
        event_id = r.json().get("event_id")
        if not event_id:
            return None

        # 3) poll result (SSE)
        url = f"{HF_SPACE}/gradio_api/call/transcribe/{event_id}"
        t0 = time.time()
        async with client.stream("GET", url, headers={"user-agent": UA}) as r:
            buffer = ""
            async for chunk in r.aiter_text():
                buffer += chunk
                if "event: complete" in buffer:
                    for line in buffer.split("\n"):
                        if line.startswith("data: "):
                            raw = line[6:]
                            try:
                                data = json.loads(raw)
                            except Exception:
                                continue
                            # Space ini return [full_text, chunks?] — cek bentuknya
                            if isinstance(data, list) and data:
                                text_full = str(data[0] or "")
                                chunks = data[1] if len(data) > 1 and isinstance(data[1], list) else []
                                segments = []
                                if chunks:
                                    for c in chunks:
                                        ts = c.get("timestamp") or [None, None]
                                        txt = str(c.get("text", "")).strip()
                                        if not txt:
                                            continue
                                        segments.append({
                                            "start": round(float(ts[0] or 0), 2),
                                            "end": round(float(ts[1] or 0), 2),
                                            "text": txt,
                                        })
                                else:
                                    # tanpa chunk: satu segmen besar (0..est)
                                    segments = [{"start": 0.0, "end": 0.0, "text": text_full.strip()}]
                                if not segments or not any(s["text"] for s in segments):
                                    print("[hf-stt] hasil kosong")
                                    return None
                                return {"segments": segments,
                                        "text": text_full.strip(),
                                        "stt_provider": "hf-whisper-large-v3"}
                            return None
                if time.time() - t0 > 280:
                    print("[hf-stt] timeout menunggu hasil")
                    return None
        return None
