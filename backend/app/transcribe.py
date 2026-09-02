"""Transcription: browser-extracted WAV chunks -> word-level transcript.

Two paths:
1. PREFERRED: Groq Whisper STT (via gateway.transcribe) — real word-level
   timestamps, no hallucination, fast. Used when an STT endpoint is available.
2. FALLBACK: multimodal chat model (Gemini-style input_audio) — estimated
   segment timings, evenly-timed words (original CortexClip approach).
"""

from __future__ import annotations

import asyncio
import json
import math
import os
from typing import Any

from .hydra import gateway

# Provider STT terakhir yang berhasil (dibaca pipeline buat analitik admin).
LAST_STT_PROVIDER: str = ""


def _mark(provider: str) -> None:
    global LAST_STT_PROVIDER
    LAST_STT_PROVIDER = provider


async def transcribe_wav_chunk(wav_bytes: bytes, offset: float, duration: float) -> list[dict[str, Any]]:
    """Transcribe one WAV chunk. Returns segments (with words) in absolute time.
    STT failover chain (di gateway): Groq → Gemini → HF Space gratis → lokal."""
    # Path 1: dedicated STT (chain di dalam gateway.transcribe)
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
            _mark(str(stt.get("stt_provider") or "groq-whisper"))
            return out
        # STT chain utama gagal/None → Path 1b: HF Space gratis → Path 1c: lokal

    # Path 1b: HF Space whisper-large-v3 (gratis, tanpa key)
    try:
        from .hf_stt import hf_transcribe
        hf = await hf_transcribe(wav_bytes)
        if hf and (hf.get("segments") or hf.get("words")):
            segments = hf.get("segments") or []
            if segments:
                # HF chunk = per segmen kalimat; word evenly-fill
                out = []
                for s in segments:
                    st_ = float(s.get("start", 0)) + offset
                    en_ = float(s.get("end", 0)) + offset
                    text = str(s.get("text", "")).strip()
                    if not text:
                        continue
                    if en_ <= st_:
                        en_ = st_ + max(0.4, len(text.split()) * 0.35)
                    seg = {"start": round(st_, 2), "end": round(en_, 2), "text": text}
                    seg["words"] = words_from_segment(seg)
                    out.append(seg)
                if out:
                    print(f"[stt-chain] sukses via {hf.get('stt_provider')} ({len(out)} segmen)")
                    _mark(str(hf.get("stt_provider") or "hf-whisper"))
                    return out
            # HF balikin full-text tanpa chunk → bagi merata sepanjang durasi
            full = str(hf.get("text", "")).strip()
            if full:
                from .local_whisper import _model_size  # noqa: F401 (import check saja)
                # split kalimat → segmen merata
                import re as _re
                sents = [s.strip() for s in _re.split(r"(?<=[.!?])\s+", full) if s.strip()]
                span = max(duration, len(sents) * 2.0)
                per = span / max(1, len(sents))
                out = []
                for i, s in enumerate(sents):
                    seg = {"start": round(offset + i * per, 2),
                           "end": round(offset + (i + 1) * per, 2), "text": s}
                    seg["words"] = words_from_segment(seg)
                    out.append(seg)
                print(f"[stt-chain] HF full-text split → {len(out)} segmen merata")
                _mark(str(hf.get("stt_provider") or "hf-whisper"))
                return out
    except Exception as exc:
        print(f"[stt-chain] HF Space gagal: {exc}")

    # Path 1c: lokal whisper (faster-whisper di VPS — jurus pamungkas)
    try:
        import tempfile
        from .local_whisper import transcribe_sync
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            f.write(wav_bytes)
            wav_tmp = f.name
        try:
            lw = await asyncio.get_event_loop().run_in_executor(
                None, transcribe_sync, wav_tmp)
        finally:
            try:
                os.unlink(wav_tmp)
            except OSError:
                pass
        if lw and (lw.get("segments") or lw.get("words")):
            segs = lw.get("segments") or []
            out = []
            for s in segs:
                st_ = float(s.get("start", 0)) + offset
                en_ = float(s.get("end", 0)) + offset
                text = str(s.get("text", "")).strip()
                if not text:
                    continue
                out.append({"start": round(st_, 2), "end": round(en_, 2), "text": text,
                            "words": s.get("words") or []})
            if out:
                print(f"[stt-chain] sukses via {lw.get('stt_provider')} ({len(out)} segmen)")
                _mark(str(lw.get("stt_provider") or "local-whisper"))
                return out
    except Exception as exc:
        print(f"[stt-chain] lokal whisper gagal: {exc}")

    # Path 1d: aidictation.com (CADANGAN TERAKHIR, layanan pihak ketiga).
    # Hanya dicoba kalau semua jalur di atas gagal; kalau solver/endpoint mati
    # fungsinya balik None cepat (ada cooldown) sehingga tidak menahan pipeline.
    try:
        from .aidictation_stt import transcribe_aidictation
        # kirim mp3 (jauh lebih kecil dari wav) — endpoint menerima audio biasa
        import subprocess as _sp
        import tempfile as _tf
        mp3_bytes = b""
        with _tf.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            f.write(wav_bytes)
            wav_tmp = f.name
        mp3_tmp = wav_tmp + ".mp3"
        try:
            _sp.run(["ffmpeg", "-y", "-v", "error", "-i", wav_tmp, "-vn",
                     "-ac", "1", "-ar", "16000", "-b:a", "64k", mp3_tmp],
                    check=True, capture_output=True, timeout=300)
            with open(mp3_tmp, "rb") as fh:
                mp3_bytes = fh.read()
        finally:
            for p in (wav_tmp, mp3_tmp):
                try:
                    os.unlink(p)
                except OSError:
                    pass
        if mp3_bytes:
            aid = await transcribe_aidictation(mp3_bytes, duration=duration)
            if aid:
                segs = aid.get("segments") or []
                out = []
                for s in segs:
                    st_ = float(s.get("start", 0)) + offset
                    en_ = float(s.get("end", 0)) + offset
                    text = str(s.get("text", "")).strip()
                    if not text or en_ <= st_:
                        continue
                    seg = {"start": round(st_, 2), "end": round(en_, 2), "text": text}
                    seg["words"] = words_from_segment(seg)
                    out.append(seg)
                if out:
                    print(f"[stt-chain] sukses via aidictation ({len(out)} segmen)")
                    _mark("aidictation")
                    return out
                # tanpa timing → bagi merata per kalimat
                full = str(aid.get("text", "")).strip()
                if full:
                    import re as _re2
                    sents = [x.strip() for x in _re2.split(r"(?<=[.!?])\s+", full) if x.strip()]
                    span = max(duration, len(sents) * 2.0)
                    per = span / max(1, len(sents))
                    out = []
                    for i, s in enumerate(sents):
                        seg = {"start": round(offset + i * per, 2),
                               "end": round(offset + (i + 1) * per, 2), "text": s}
                        seg["words"] = words_from_segment(seg)
                        out.append(seg)
                    print(f"[stt-chain] aidictation full-text → {len(out)} segmen merata")
                    _mark("aidictation")
                    return out
    except Exception as exc:
        print(f"[stt-chain] aidictation gagal: {exc}")

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
