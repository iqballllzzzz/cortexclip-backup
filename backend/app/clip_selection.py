"""Clip selection — two-pass, ported from OpenShorts clip_selection.py.

Pass 1 (score): Gemini scores transcript windows for viral potential.
Pass 2 (detail): for the best windows, pick exact clip boundaries + metadata
(title, description, hashtags, score, hook) and snap boundaries to word edges.

Structured JSON is requested but repaired defensively (parse + validate),
because not all Hydra providers support response_format schemas.
"""

from __future__ import annotations

import json
import math
import os
from typing import Any, Optional

from .hydra import gateway
from .transcribe import transcript_to_text

WINDOW_SECONDS = 60
OVERLAP_SECONDS = 10
MIN_CLIP = 15
MAX_CLIP = 75

SCORE_SYSTEM = (
    "Kamu adalah editor konten viral kelas dunia (setara tim OpusClip). "
    "Kamu menilai potensi viral sebuah bagian video dari transkrip. "
    "Jawab HANYA dengan JSON valid, tanpa teks lain."
)

DETAIL_SYSTEM = (
    "Kamu adalah editor short-form kelas dunia. Kamu memilih potongan video "
    "pendek yang punya hook kuat, konteks utuh, dan penutup memuaskan. "
    "Jawab HANYA dengan JSON array valid. Semua judul/deskripsi/hashtag dalam "
    "bahasa transkrip."
)


def build_windows(transcript: dict[str, Any]) -> list[dict[str, Any]]:
    """Fixed windows over the transcript, like OpenShorts pass 1."""
    segments = transcript.get("segments", [])
    if not segments:
        return []
    duration = transcript.get("duration") or segments[-1]["end"]
    windows = []
    start = 0.0
    step = max(WINDOW_SECONDS - OVERLAP_SECONDS, 1)
    while start < duration:
        end = min(start + WINDOW_SECONDS, duration)
        if end - start >= 5:
            segs = [s for s in segments if s["end"] > start and s["start"] < end]
            if any(s.get("text", "").strip() for s in segs):
                windows.append({
                    "id": f"w{len(windows)}",
                    "start": round(start, 2),
                    "end": round(end, 2),
                    "text": " ".join(s["text"] for s in segs)[:2000],
                })
        start += step
    return windows


def clip_count_targets(n_windows: int) -> tuple[int, int]:
    """Floor/ceiling on the clip count (lesson from OpenShorts: retention
    hangs on clip COUNT, not quality — users who get 4-9 clips come back)."""
    n = max(1, n_windows)
    floor = min(6, max(3, round(n * 0.6)))
    ceiling = max(floor, min(10, n))
    floor = int(os.environ.get("CLIP_TARGET_MIN", floor))
    ceiling = int(os.environ.get("CLIP_TARGET_MAX", ceiling))
    return floor, ceiling


def _parse_json(raw: str) -> Any:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw
        raw = raw.rsplit("```", 1)[0]
    start_candidates = [raw.find("["), raw.find("{")]
    starts = [s for s in start_candidates if s != -1]
    if not starts:
        raise ValueError("no JSON found")
    start = min(starts)
    end = max(raw.rfind("]"), raw.rfind("}"))
    if end <= start:
        raise ValueError("no JSON found")
    return json.loads(raw[start:end + 1])


async def score_windows(windows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Pass 1: score each window 0-100 for viral potential."""
    listing = "\n".join(
        f"{w['id']} [{w['start']:.0f}-{w['end']:.0f}s]: {w['text'][:600]}"
        for w in windows
    )
    prompt = (
        "Nilai potensi viral tiap window transkrip video berikut untuk "
        "short-form vertikal (TikTok/Reels/Shorts). Balas JSON object: "
        '{"windows": [{"id": "...", "score": 0-100, "reason": "singkat"}]}\n\n'
        f"{listing}\n\nBalas maksimal 300 kata."
    )
    content = await gateway.chat(
        [{"role": "system", "content": SCORE_SYSTEM},
         {"role": "user", "content": prompt}],
        temperature=0.3, max_tokens=2048,
    )
    try:
        data = _parse_json(content)
    except Exception:
        # uniform fallback: all windows neutral score
        return [dict(w, score=50, reason="fallback") for w in windows]
    if isinstance(data, list):
        data = {"windows": data}
    scores = {str(w.get("id")): w for w in data.get("windows", []) if isinstance(w, dict)}
    out = []
    for w in windows:
        sc = scores.get(w["id"], {})
        try:
            score = max(0, min(100, int(sc.get("score", 50))))
        except (TypeError, ValueError):
            score = 50
        out.append(dict(w, score=score, reason=str(sc.get("reason", ""))[:200]))
    out.sort(key=lambda w: w["score"], reverse=True)
    return out


async def detail_pass(
    transcript: dict[str, Any],
    shortlist: list[dict[str, Any]],
    target_count: int,
) -> list[dict[str, Any]]:
    """Pass 2: exact boundaries + metadata per shortlisted window."""
    floor, ceiling = clip_count_targets(len(shortlist))
    target = max(min(target_count, ceiling), min(floor, ceiling))
    # give the model the transcript restricted to each window
    segments = transcript.get("segments", [])
    listing = []
    for w in shortlist:
        segs = [s for s in segments if s["end"] > w["start"] and s["start"] < w["end"]]
        text = " ".join(s["text"] for s in segs)
        listing.append(f"WINDOW {w['id']} [{w['start']:.0f}-{w['end']:.0f}s] skor {w['score']}:\n{text[:4000]}")
    duration = transcript.get("duration") or (segments[-1]["end"] if segments else 0)
    prompt = (
        f"Dari window transkrip berikut, pilih total {target} klip terbaik "
        f"(WAJIB minimal {floor}) untuk short-form vertikal. Durasi tiap klip "
        f"{MIN_CLIP}-{MAX_CLIP} detik, tidak boleh tumpang tindih, urut dari "
        f"skor tertinggi. Total durasi video: {duration:.0f} detik.\n\n"
        + "\n\n".join(listing)
        + '\n\nUntuk tiap klip kembalikan objek:\n'
          '{"title": "judul clickbait tapi jujur, maks 60 karakter", '
          '"description": "1-2 kalimat caption siap unggah", '
          '"hashtags": ["#tag1","#tag2","#tag3","#tag4","#tag5"], '
          '"start": detik_mulai_angka, "end": detik_selesai_angka, '
          '"score": 0-100, "hook": "tipe hook singkat", '
          '"source_window_id": "id window"}\n\n'
        f"Balas JSON object: {{\"shorts\": [ ... ]}}. Maksimal 400 kata total."
    )
    content = await gateway.chat(
        [{"role": "system", "content": DETAIL_SYSTEM},
         {"role": "user", "content": prompt}],
        temperature=0.4, max_tokens=4096,
    )
    try:
        data = _parse_json(content)
    except Exception:
        return []
    if isinstance(data, list):
        data = {"shorts": data}
    clips = []
    for c in data.get("shorts", []):
        if not isinstance(c, dict):
            continue
        try:
            start = float(c.get("start", -1))
            end = float(c.get("end", -1))
        except (TypeError, ValueError):
            continue
        if start < 0 or end <= start:
            continue
        end = min(end, duration)
        if end - start < 5:
            continue
        clips.append({
            "title": str(c.get("title", "Klip tanpa judul"))[:120],
            "description": str(c.get("description", ""))[:500],
            "hashtags": [str(h) for h in (c.get("hashtags") or [])][:8],
            "start": round(max(0, start), 2),
            "end": round(end, 2),
            "score": max(0, min(100, int(float(c.get("score", 70) or 70)))),
            "hook": str(c.get("hook", "Hook kuat di 3 detik pertama"))[:120],
            "source_window_id": str(c.get("source_window_id", "")),
        })
    # dedupe overlaps (keep higher score)
    clips.sort(key=lambda c: c["score"], reverse=True)
    kept: list[dict[str, Any]] = []
    for c in clips:
        if any(not (c["end"] <= k["start"] or c["start"] >= k["end"]) for k in kept):
            continue
        kept.append(c)
        if len(kept) >= target:
            break
    return kept


def snap_clip_to_words(
    clip: dict[str, Any], transcript: dict[str, Any]
) -> dict[str, Any]:
    """Snap boundaries to word edges so we never cut mid-word
    (ported from OpenShorts snap_clip_to_words)."""
    words = [w for s in transcript.get("segments", []) for w in s.get("words", [])]
    if not words:
        return clip
    words.sort(key=lambda w: w["start"])
    start, end = clip["start"], clip["end"]
    # snap start to the first word that starts at/after start-1s
    cands = [w for w in words if start - 1.5 <= w["start"] <= start + 2.0]
    if cands:
        start = cands[0]["start"]
    cands = [w for w in words if end - 2.0 <= w["end"] <= end + 1.5]
    if cands:
        end = cands[-1]["end"]
    if end - start < 5:
        start, end = clip["start"], clip["end"]
    clip["start"] = round(max(0, start), 2)
    clip["end"] = round(end, 2)
    return clip


def words_in_range(transcript: dict[str, Any], start: float, end: float) -> list[dict[str, Any]]:
    """Caption words re-based to clip-local time."""
    out = []
    for s in transcript.get("segments", []):
        for w in s.get("words", []):
            if w["end"] <= start or w["start"] >= end:
                continue
            out.append({
                "word": w["word"],
                "start": round(max(0, w["start"] - start), 2),
                "end": round(max(0.2, w["end"] - start), 2),
            })
    return out


async def detect_clips(transcript: dict[str, Any], target_count: int = 10) -> list[dict[str, Any]]:
    """Full two-pass selection. Returns clip dicts with caption words."""
    windows = build_windows(transcript)
    if not windows:
        return []
    scored = await score_windows(windows)
    shortlist = scored[: max(3, math.ceil(len(scored) * 0.5))]
    clips = await detail_pass(transcript, shortlist, target_count)
    out = []
    for c in clips:
        c = snap_clip_to_words(c, transcript)
        c["caption_words"] = words_in_range(transcript, c["start"], c["end"])
        out.append(c)
    out.sort(key=lambda c: c["score"], reverse=True)
    return out
