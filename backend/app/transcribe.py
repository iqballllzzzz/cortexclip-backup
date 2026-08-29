"""Transcription: browser-extracted WAV chunks -> word-level transcript.

Two paths:
1. PREFERRED: Groq Whisper STT (via gateway.transcribe) — real word-level
   timestamps, no hallucination, fast. Used when an STT endpoint is available.
2. FALLBACK: multimodal chat model (Gemini-style input_audio) — estimated
   segment timings, evenly-timed words (original CortexClip approach).
"""

from __future__ import annotations

import json
import math
from typing import Any

from .hydra import gateway


async def transcribe_wav_chunk(wav_bytes: bytes, offset: float, duration: float) -> list[dict[str, Any]]:
    """Transcribe one WAV chunk. Returns segments (with words) in absolute time."""
    # Path 1: dedicated STT
    stt = await gateway.transcribe(wav_bytes)
    if stt:
        segments = stt.get("segments") or []
        # Groq whisper often returns top-level `words` + `text` with
        # `segments: null` — collapse those into a single segment so the
        # pipeline never stalls on a "no segments" response. Word timings are
        # already absolute within the chunk (Groq returns them relative to 0),
        # so we only add the chunk offset.
        if not segments and stt.get("words"):
            wl = []
            for w in stt.get("words") or []:
                if not isinstance(w, dict):
                    continue
                wl.append({
                    "word": str(w.get("word", "")).strip(),
                    "start": round(float(w.get("start", 0)) + offset, 2),
                    "end": round(float(w.get("end", 0)) + offset, 2),
                })
            wl = [w for w in wl if w["word"]]
            text = str(stt.get("text", "") or "").strip()
            if wl or text:
                start = (wl[0]["start"] - offset) if wl else 0.0
                end = (wl[-1]["end"] - offset) if wl else float(stt.get("duration") or duration)
                return [{
                    "start": round(start + offset, 2),
                    "end": round(end + offset, 2),
                    "text": text or " ".join(w["word"] for w in wl),
                    "words": wl or words_from_segment({"start": start + offset, "end": end + offset, "text": text}),
                }]
        if segments:
            out = []
            for s in segments:
                text = str(s.get("text", "")).strip()
                if not text or text == ".":
                    continue
                start = float(s.get("start", 0)) + offset
                end = float(s.get("end", 0)) + offset
                # word timings re-based to absolute
                words = []
                for w in s.get("words", []) or []:
                    if not isinstance(w, dict):
                        continue
                    words.append({
                        "word": str(w.get("word", "")).strip(),
                        "start": round(float(w.get("start", 0)) + offset, 2),
                        "end": round(float(w.get("end", 0)) + offset, 2),
                    })
                words = [w for w in words if w["word"]]
                out.append({
                    "start": round(start, 2),
                    "end": round(end, 2),
                    "text": text,
                    "words": words or words_from_segment({"start": start, "end": end, "text": text}),
                })
            return out
        # whisper returned no segments -> try chat fallback

    # Path 2: multimodal chat model
    import base64
    b64 = base64.b64encode(wav_bytes).decode()
    messages = [
        {"role": "system", "content": (
            "Kamu adalah mesin transkripsi presisi tinggi. Keluarkan HANYA JSON array, "
            "tanpa penjelasan, tanpa markdown."
        )},
        {"role": "user", "content": [
            {"type": "text", "text": (
                f"Transkripsikan audio ini kata demi kata dalam bahasa aslinya. "
                f"Pecah menjadi segmen pendek (maksimal 12 kata). Durasi audio "
                f"{duration:.1f} detik. Kembalikan JSON array objek: "
                f'[{{"start": detik_mulai, "end": detik_selesai, "text": "..."}}]. '
                f"Timestamp relatif terhadap awal audio ini (mulai dari 0)."
            )},
            {"type": "input_audio", "input_audio": {"data": b64, "format": "wav"}},
        ]},
    ]
    try:
        content = await gateway.chat(messages, audio=True, temperature=0.0, max_tokens=4096)
    except Exception:
        return []
    return parse_segments(content, offset)


def parse_segments(raw: str, offset: float) -> list[dict[str, Any]]:
    try:
        arr = json.loads(extract_json_array(raw))
    except Exception:
        return []
    if not isinstance(arr, list):
        return []
    out = []
    for s in arr:
        if not isinstance(s, dict):
            continue
        text = str(s.get("text", "")).strip()
        if not text:
            continue
        try:
            start = float(s.get("start", 0))
            end = float(s.get("end", 0))
        except (TypeError, ValueError):
            continue
        if end < start:
            start, end = end, start
        end = max(end, start + 0.4)
        seg = {"start": round(start + offset, 2), "end": round(end + offset, 2), "text": text}
        seg["words"] = words_from_segment(seg)
        out.append(seg)
    return out


def extract_json_array(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw
        raw = raw.rsplit("```", 1)[0]
    start = raw.find("[")
    end = raw.rfind("]")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("no JSON array found")
    return raw[start:end + 1]


def words_from_segment(seg: dict[str, Any]) -> list[dict[str, Any]]:
    tokens = seg["text"].split()
    if not tokens:
        return []
    span = max(0.2, seg["end"] - seg["start"])
    per = span / len(tokens)
    return [
        {"word": t, "start": round(seg["start"] + i * per, 2), "end": round(seg["start"] + (i + 1) * per, 2)}
        for i, t in enumerate(tokens)
    ]


def transcript_with_words(segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Ensure every segment has words (fill evenly where missing)."""
    out = []
    for seg in segments:
        s = dict(seg)
        if not s.get("words"):
            s["words"] = words_from_segment(s)
        out.append(s)
    return out


def transcript_to_text(transcript: dict[str, Any], limit: int = 60000) -> str:
    lines = []
    for s in transcript.get("segments", []):
        lines.append(f"[{s['start']:.1f}-{s['end']:.1f}] {s['text']}")
    return "\n".join(lines)[:limit]
