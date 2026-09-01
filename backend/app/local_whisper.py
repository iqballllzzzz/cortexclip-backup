"""Local Whisper STT (faster-whisper) — jalan di CPU VPS sendiri:
gratis, tanpa API key, tanpa rate limit. Model di-cache sekali lalu reuse.
Kualitas word-timestamps mirip Groq Whisper (sama-sama Whisper)."""
from __future__ import annotations

import os
import threading
from typing import Any, Optional

_lock = threading.Lock()
_model = None
_model_size = os.environ.get("LOCAL_WHISPER_MODEL", "small")

# 4 CPU / 8GB RAM: "small" = ~460MB, akurat utk id/en, CPU ~2-4x realtime.
# Naik ke "medium" kalau mau lebih akurat (butuh ~1.5GB RAM, lebih lambat).


def _get_model():
    global _model
    if _model is None:
        with _lock:
            if _model is None:
                from faster_whisper import WhisperModel
                print(f"[local-whisper] loading model '{_model_size}' (sekali saja)...")
                _model = WhisperModel(
                    _model_size,
                    device="cpu",
                    compute_type="int8",
                    cpu_threads=4,
                )
                print("[local-whisper] model siap")
    return _model


def transcribe_sync(wav_path: str) -> Optional[dict[str, Any]]:
    """Transcribe file WAV lokal. Return verbose_json-like dict (segments+words)
    kompatibel dgn format Groq, atau None kalau gagal."""
    try:
        model = _get_model()
        segments_gen, info = model.transcribe(
            wav_path,
            language=None,            # auto-detect
            beam_size=5,
            word_timestamps=True,
            vad_filter=True,          # buang silence — hemat waktu & hallucination
        )
        segments = []
        words_flat = []
        for seg in segments_gen:
            s_words = []
            for w in (seg.words or []):
                token = (w.word or "").strip()
                if not token:
                    continue
                s_words.append({"word": token, "start": round(w.start, 2), "end": round(w.end, 2)})
                words_flat.append(s_words[-1])
            text = (seg.text or "").strip()
            if not text:
                continue
            segments.append({
                "start": round(seg.start, 2),
                "end": round(seg.end, 2),
                "text": text,
                "words": s_words,
            })
        if not segments and not words_flat:
            return None
        return {
            "segments": segments,
            "words": words_flat or None,
            "text": " ".join(s["text"] for s in segments),
            "language": info.language if info else "id",
            "stt_provider": f"local-whisper-{_model_size}",
        }
    except Exception as exc:
        print(f"[local-whisper] gagal: {exc}")
        return None
