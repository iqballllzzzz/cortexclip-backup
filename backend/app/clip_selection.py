"""Clip selection — two-pass, ported from OpenShorts clip_selection.py.

Pass 1 (score): Gemini scores transcript windows for viral potential.
Pass 2 (detail): for the best windows, pick exact clip boundaries + metadata
(title, description, hashtags, score, hook) and snap boundaries to word edges.

Structured JSON is requested but repaired defensively (parse + validate),
because not all Hydra providers support response_format schemas.
"""

from __future__ import annotations

import asyncio
import json
import math
import os
import re
from typing import Any, Optional

from .hydra import gateway
from .transcribe import transcript_to_text

WINDOW_SECONDS = 60
OVERLAP_SECONDS = 10
MIN_CLIP = 15
MAX_CLIP = 75

# Kata pengisi / basa-basi: dipakai menilai kepadatan isi sebuah kandidat klip.
FILLER_WORDS = {
    "eh", "ehm", "em", "mmm", "hmm", "anu", "apa", "gitu", "gini", "kan", "sih",
    "nih", "tuh", "ya", "yah", "iya", "oke", "ok", "nah", "jadi", "terus",
    "pokoknya", "kayak", "kaya", "kalo", "kalau", "tapi", "cuma", "aja", "aja.",
    "dong", "deh", "loh", "lah", "um", "uh", "er", "like", "you", "know",
}

# Frasa pembuka/penutup siaran yang biasanya BUKAN materi viral.
BOILERPLATE_PATTERNS = (
    "selamat datang", "kembali lagi", "jangan lupa subscribe", "like dan subscribe",
    "sebelum kita mulai", "di episode kali ini", "sampai jumpa", "terima kasih sudah",
    "tinggalkan komentar", "nyalakan notifikasi", "video kali ini disponsori",
    "iklan", "sponsor", "welcome back", "don't forget to subscribe",
)

SCORE_SYSTEM = (
    "Kamu editor konten viral kelas dunia (setara tim OpusClip). Kamu menilai "
    "potensi viral sebuah bagian video dari transkrip. Kamu SANGAT ketat: "
    "bagian yang isinya basa-basi, perkenalan, iklan, atau ngobrol tanpa poin "
    "harus diberi skor RENDAH (0-25). Jawab HANYA JSON valid, tanpa teks lain."
)

DETAIL_SYSTEM = (
    "Kamu editor short-form kelas dunia. Kamu memilih potongan video pendek "
    "yang punya HOOK kuat di 3 detik pertama, satu ide utuh, dan penutup "
    "memuaskan (bukan kalimat menggantung). Judul/deskripsi/hashtag WAJIB "
    "berasal dari isi klip itu sendiri — dilarang generik. Jawab HANYA dengan "
    "JSON array valid. Semua teks dalam bahasa transkrip."
)

VIRAL_CRITERIA = (
    "KRITERIA WAJIB klip berpotensi viral:\n"
    "1. HOOK: 3 detik pertama sudah bikin penasaran (pertanyaan tajam, klaim "
    "berani, angka mengejutkan, konflik, atau pengakuan personal).\n"
    "2. SATU IDE UTUH: ada pembuka → isi → kesimpulan/punchline. Bukan "
    "potongan tengah kalimat.\n"
    "3. NILAI EMOSI: bikin kaget, ketawa, terinspirasi, marah, atau relate.\n"
    "4. BISA DIPAHAMI SENDIRIAN: penonton tak perlu tahu konteks sebelumnya.\n"
    "5. ADA YANG BISA DIBAWA PULANG: pelajaran, cerita, atau lelucon jelas.\n\n"
    "TOLAK (skor 0-25) kalau: perkenalan/sapaan, iklan/sponsor, obrolan "
    "ngalor-ngidul tanpa poin, mengulang hal sama, penuh 'eh/anu/gitu', "
    "atau kalimatnya terputus di awal/akhir."
)


def content_density(text: str) -> float:
    """Rasio kata bermakna (0..1). Rendah = banyak basa-basi/filler."""
    toks = [t for t in re.findall(r"[a-zA-Z\u00c0-\u024f']+", (text or "").lower()) if t]
    if not toks:
        return 0.0
    meaningful = [t for t in toks if t not in FILLER_WORDS and len(t) > 2]
    return len(meaningful) / len(toks)


def boilerplate_penalty(text: str) -> int:
    """Penalti skor untuk sapaan/iklan/penutup siaran."""
    t = (text or "").lower()
    hits = sum(1 for p in BOILERPLATE_PATTERNS if p in t)
    return min(45, hits * 18)


def hook_bonus(text: str) -> int:
    """Bonus untuk penanda hook: pertanyaan, angka, kata kejut."""
    t = (text or "").lower()
    bonus = 0
    if "?" in t:
        bonus += 6
    if re.search(r"\d", t):
        bonus += 5
    strong = ("rahasia", "ternyata", "kesalahan", "jangan", "gila", "kaget",
              "parah", "penting", "harus", "gagal", "berhasil", "pertama kali",
              "gak nyangka", "nggak nyangka", "sebenarnya", "faktanya",
              "bahaya", "cara", "kenapa", "alasan")
    bonus += min(12, sum(4 for w in strong if w in t))
    return min(20, bonus)


def quality_adjust(text: str, base_score: int) -> tuple[int, str]:
    """Skor akhir + alasan, memakai heuristik isi (bukan cuma AI)."""
    density = content_density(text)
    score = base_score
    notes = []
    if density < 0.45:
        score -= 25
        notes.append(f"filler tinggi ({density:.0%} kata bermakna)")
    elif density < 0.6:
        score -= 10
        notes.append(f"agak banyak filler ({density:.0%})")
    pen = boilerplate_penalty(text)
    if pen:
        score -= pen
        notes.append("berisi sapaan/iklan")
    bon = hook_bonus(text)
    if bon:
        score += bon
        notes.append(f"penanda hook +{bon}")
    words = len(text.split())
    if words < 25:
        score -= 20
        notes.append("terlalu sedikit ucapan")
    return max(0, min(100, score)), "; ".join(notes)


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
    body = raw[start:end + 1]
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        pass
    # JSON kepotong (max_tokens): petik objek-objek yang masih utuh dari
    # dalam array — objek terakhir yang setengah jalan otomatis gugur.
    import re as _re
    m = _re.search(r'"(shorts|windows)"\s*:\s*\[', body)
    arr = body[m.end():] if m else body
    objs: list[dict[str, Any]] = []
    depth = 0
    in_str = False
    esc = False
    obj_start = None
    for i, ch in enumerate(arr):
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            if depth == 0:
                obj_start = i
            depth += 1
        elif ch == "}":
            if depth > 0:
                depth -= 1
                if depth == 0 and obj_start is not None:
                    try:
                        o = json.loads(arr[obj_start:i + 1])
                        if isinstance(o, dict):
                            objs.append(o)
                    except Exception:
                        pass
                    obj_start = None
    if not objs:
        raise ValueError("tidak ada objek JSON utuh")
    if m:
        key = m.group(1)
    elif any("id" in o for o in objs):
        key = "windows"
    else:
        key = "shorts"
    return {key: objs}


async def _score_batch(windows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Skor satu batch window. Balik map id -> {score, reason}."""
    listing = "\n".join(
        f"{w['id']} [{w['start']:.0f}-{w['end']:.0f}s]: {w['text'][:600]}"
        for w in windows
    )
    prompt = (
        "Nilai potensi viral tiap window transkrip video berikut untuk "
        "short-form vertikal (TikTok/Reels/Shorts).\n\n"
        + VIRAL_CRITERIA
        + "\n\nBalas JSON object: "
        '{"windows": [{"id": "...", "score": 0-100, "reason": "singkat"}]}\n\n'
        f"{listing}\n\nBalas maksimal 300 kata."
    )
    content = await gateway.chat(
        [{"role": "system", "content": SCORE_SYSTEM},
         {"role": "user", "content": prompt}],
        temperature=0.3, max_tokens=2048,
    )
    data = _parse_json(content)
    if isinstance(data, list):
        data = {"windows": data}
    return {str(w.get("id")): w for w in data.get("windows", [])
            if isinstance(w, dict)}


async def score_windows(windows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Pass 1: skor 0-100 potensi viral + koreksi heuristik kualitas isi.

    Video BERJAM-JAM menghasilkan ratusan window (1 jam ≈ 72, 3 jam ≈ 216).
    Semuanya dalam satu prompt = melebihi batas token dan gagal total, jadi
    window dipecah jadi batch dan dinilai PARALEL (lebih cepat + tidak ada
    satu titik kegagalan: batch yang gagal jatuh ke heuristik saja).
    """
    batch_size = int(os.environ.get("SCORE_BATCH", "24"))
    batches = [windows[i:i + batch_size] for i in range(0, len(windows), batch_size)]
    sem = asyncio.Semaphore(int(os.environ.get("SCORE_PARALLEL", "3")))

    async def run(b: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
        async with sem:
            try:
                return await _score_batch(b)
            except Exception as exc:
                print(f"[clip_selection] batch skor gagal ({len(b)} window): "
                      f"{type(exc).__name__} {str(exc)[:120]}")
                return {}

    maps = await asyncio.gather(*[run(b) for b in batches])
    scores: dict[str, dict[str, Any]] = {}
    for m in maps:
        scores.update(m)
    if len(batches) > 1:
        print(f"[clip_selection] {len(windows)} window → {len(batches)} batch, "
              f"{len(scores)} dinilai AI")

    out = []
    for w in windows:
        sc = scores.get(w["id"], {})
        try:
            score = max(0, min(100, int(sc.get("score", 55))))
        except (TypeError, ValueError):
            score = 55
        ai_reason = str(sc.get("reason", ""))[:160]
        if not sc:
            ai_reason = "heuristik (AI tidak menilai window ini)"
        score, note = quality_adjust(w["text"], score)
        reason = f"{ai_reason} | {note}" if note else ai_reason
        out.append(dict(w, score=score, reason=reason[:200]))
    out.sort(key=lambda w: w["score"], reverse=True)
    return out


async def detail_pass(
    transcript: dict[str, Any],
    shortlist: list[dict[str, Any]],
    target_count: int,
    genre: str = "",
) -> list[dict[str, Any]]:
    """Pass 2: exact boundaries + metadata per shortlisted window."""
    floor, ceiling = clip_count_targets(len(shortlist))
    target = max(min(target_count, ceiling), min(floor, ceiling))
    # give the model the transcript restricted to each window
    segments = transcript.get("segments", [])
    listing = []
    # anggaran teks total ±40k karakter (aman untuk konteks model): makin
    # banyak window, makin ringkas tiap window — supaya video berjam-jam
    # tidak melewati batas token dan gagal total.
    per_window = max(900, min(4000, int(40000 / max(1, len(shortlist)))))
    for w in shortlist:
        segs = [s for s in segments if s["end"] > w["start"] and s["start"] < w["end"]]
        text = " ".join(s["text"] for s in segs)
        listing.append(f"WINDOW {w['id']} [{w['start']:.0f}-{w['end']:.0f}s] "
                       f"skor {w['score']}:\n{text[:per_window]}")
    duration = transcript.get("duration") or (segments[-1]["end"] if segments else 0)
    genre_note = (
        f"Genre video: **{genre}**. Judul, deskripsi, dan hashtag WAJIB terasa "
        f"khas genre {genre} dan menyebut hal konkret yang dibicarakan di klip.\n\n"
        if genre else ""
    )
    prompt = (
        f"Dari window transkrip berikut, pilih total {target} klip TERBAIK "
        f"(WAJIB minimal {floor}) untuk short-form vertikal. Durasi tiap klip "
        f"{MIN_CLIP}-{MAX_CLIP} detik, tidak boleh tumpang tindih, urut dari "
        f"skor tertinggi. Total durasi video: {duration:.0f} detik.\n\n"
        + genre_note
        + VIRAL_CRITERIA
        + "\n\nBATAS AWAL/AKHIR: mulai TEPAT di awal kalimat hook (jangan "
          "potong tengah kalimat) dan akhiri setelah kalimat penutup selesai.\n\n"
        + "\n\n".join(listing)
        + '\n\nUntuk tiap klip kembalikan objek:\n'
          '{"title": "judul clickbait tapi jujur, maks 60 karakter, ambil dari isi klip", '
          '"description": "2-3 kalimat caption siap unggah yang MENYEBUT isi klip '
          '(bukan kalimat umum), diakhiri ajakan komentar/simpan", '
          '"hashtags": ["#tag1","#tag2","#tag3","#tag4","#tag5","#tag6"], '
          '"start": detik_mulai_angka, "end": detik_selesai_angka, '
          '"score": 0-100, "hook": "kutipan/parafrase hook 3 detik pertama", '
          '"quote": "1 kalimat paling kuat di klip", '
          '"topic": "topik konkret klip 2-4 kata", '
          '"source_window_id": "id window"}\n\n'
        "ATURAN hashtag: 2 hashtag topik spesifik (mis. #investasisaham), "
        "2 hashtag genre/niche, 2 hashtag umum (#fyp #shorts). "
        "DILARANG hashtag yang tidak berhubungan dengan isi klip.\n\n"
        f"Balas JSON object: {{\"shorts\": [ ... ]}}. Maksimal 600 kata total."
    )
    content = await gateway.chat(
        [{"role": "system", "content": DETAIL_SYSTEM},
         {"role": "user", "content": prompt}],
        temperature=0.4, max_tokens=8000,
    )
    try:
        data = _parse_json(content)
    except Exception:
        print(f"[clip_selection] detail_pass parse gagal, content: {content[:300]!r}")
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
            "hook": str(c.get("hook", "Hook kuat di 3 detik pertama"))[:160],
            "quote": str(c.get("quote", ""))[:200],
            "topic": str(c.get("topic", ""))[:60],
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


def clip_text(transcript: dict[str, Any], start: float, end: float) -> str:
    """Teks ucapan dalam rentang klip (untuk validasi kualitas)."""
    parts = []
    for s in transcript.get("segments", []):
        if s["end"] <= start or s["start"] >= end:
            continue
        parts.append(str(s.get("text", "")))
    return " ".join(parts).strip()


async def detect_clips(
    transcript: dict[str, Any],
    target_count: int = 10,
    genre: str = "",
) -> list[dict[str, Any]]:
    """Full two-pass selection + filter kualitas. Returns clip dicts."""
    windows = build_windows(transcript)
    if not windows:
        return []
    scored = await score_windows(windows)
    # buang window sampah lebih awal (skor < 30 = basa-basi/iklan) tapi
    # sisakan minimal 4 supaya video pendek tetap dapat klip
    good = [w for w in scored if w["score"] >= 30]
    if len(good) < 4:
        good = scored[:4]
    shortlist = good[: max(4, math.ceil(len(good) * 0.6))]
    # BATAS untuk video berjam-jam: detail_pass mengirim teks penuh tiap window,
    # jadi shortlist ratusan window akan melewati batas token dan gagal total.
    # Ambil kandidat terbaik saja — cukup jauh di atas target klip.
    max_short = int(os.environ.get("SHORTLIST_MAX", "28"))
    if len(shortlist) > max_short:
        print(f"[clip_selection] shortlist {len(shortlist)} → dipotong {max_short} "
              f"teratas (video panjang)")
        shortlist = shortlist[:max_short]
    # detail_pass bisa gagal parse (provider garbage / rate-limit) — retry 3x
    clips: list[dict[str, Any]] = []
    for attempt in range(3):
        clips = await detail_pass(transcript, shortlist, target_count, genre)
        if clips:
            break
        print(f"[clip_selection] detail_pass kosong (attempt {attempt + 1}/3), retry 20s…")
        await asyncio.sleep(20)

    out = []
    for c in clips:
        c = snap_clip_to_words(c, transcript)
        text = clip_text(transcript, c["start"], c["end"])
        # skor akhir DIKOREKSI oleh isi klip yang benar-benar terpotong,
        # bukan hanya window kandidat → klip filler otomatis turun/keluar
        final_score, note = quality_adjust(text, c["score"])
        c["score"] = final_score
        c["quality_note"] = note
        c["caption_words"] = words_in_range(transcript, c["start"], c["end"])
        if len(c["caption_words"]) < 12:
            print(f"[clip_selection] buang klip {c['start']}-{c['end']}: kata terlalu sedikit")
            continue
        if final_score < 25:
            print(f"[clip_selection] buang klip skor {final_score} ({note})")
            continue
        out.append(c)
    # kalau filter terlalu ganas dan semua terbuang, pakai 3 terbaik apa adanya
    if not out and clips:
        for c in clips[:3]:
            c["caption_words"] = words_in_range(transcript, c["start"], c["end"])
            out.append(c)
    out.sort(key=lambda c: c["score"], reverse=True)
    return out
