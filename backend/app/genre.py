"""Deteksi GENRE video + rekomendasi ikon/b-roll/emoji yang relate.

Dipakai supaya overlay benar-benar cocok dengan isi klip: video komedi →
ikon & footage lucu, podcast bisnis → uang/grafik, olahraga → gym, dst.
Genre dideteksi sekali per PROJECT (dari transkrip penuh) dan disimpan di
kolom projects.genre supaya tiap klip memakai hasil yang sama.
"""
from __future__ import annotations

import json
import re
from typing import Any

# Genre → kategori overlay yang relevan (urut prioritas)
GENRE_CATEGORIES: dict[str, list[str]] = {
    "comedy":    ["comedy", "celebration", "people", "animal", "abstract"],
    "business":  ["money", "work", "city", "tech", "abstract"],
    "tech":      ["tech", "abstract", "work", "city"],
    "education": ["education", "tech", "people", "health"],
    "sports":    ["fitness", "celebration", "people", "abstract"],
    "food":      ["food", "people", "celebration", "lifestyle"],
    "travel":    ["travel", "nature", "city", "people"],
    "music":     ["music", "celebration", "people", "abstract"],
    "gaming":    ["gaming", "tech", "celebration", "abstract"],
    "lifestyle": ["lifestyle", "people", "city", "nature", "food"],
    "drama":     ["drama", "fire", "people", "abstract"],
    "health":    ["health", "fitness", "food", "nature"],
    "motivation": ["success", "fire", "money", "fitness", "celebration"],
}

# Genre → emoji yang cocok (dipakai bila kata tidak punya emoji spesifik)
GENRE_EMOJI: dict[str, list[str]] = {
    "comedy":    ["😂", "🤣", "😆", "🙈", "😅", "🎉"],
    "business":  ["💰", "📈", "💼", "🏆", "💡"],
    "tech":      ["💻", "🤖", "⚡", "🧠", "📱"],
    "education": ["📚", "🧠", "💡", "✏️", "🎓"],
    "sports":    ["💪", "🏋️", "🔥", "🏆", "⚽"],
    "food":      ["🍽️", "😋", "🔥", "👨‍🍳", "🍕"],
    "travel":    ["✈️", "🌍", "🏝️", "📸", "🗺️"],
    "music":     ["🎵", "🎤", "🎧", "🔥", "🎸"],
    "gaming":    ["🎮", "🕹️", "🔥", "😱", "🏆"],
    "lifestyle": ["✨", "❤️", "🏠", "☕", "🌸"],
    "drama":     ["😱", "⚠️", "💔", "😢", "🔥"],
    "health":    ["💪", "🥗", "❤️", "🧘", "😴"],
    "motivation": ["🔥", "💪", "🚀", "🏆", "💡"],
}

# Kata kunci per genre (Indonesia + Inggris) untuk fallback tanpa AI
GENRE_KEYWORDS: dict[str, list[str]] = {
    "comedy": ["lucu", "ketawa", "ngakak", "receh", "jokes", "bercanda", "kocak",
               "haha", "wkwk", "gokil", "funny", "joke", "comedy", "prank"],
    "business": ["bisnis", "usaha", "modal", "profit", "untung", "rugi", "investasi",
                 "saham", "cuan", "omzet", "klien", "startup", "marketing", "jualan",
                 "uang", "duit", "gaji", "karyawan", "perusahaan", "miliar", "juta"],
    "tech": ["teknologi", "aplikasi", "software", "coding", "program", "ai",
             "komputer", "internet", "data", "algoritma", "server", "digital"],
    "education": ["belajar", "sekolah", "kuliah", "guru", "dosen", "ilmu",
                  "pelajaran", "kampus", "ujian", "materi", "riset", "penelitian"],
    "sports": ["olahraga", "latihan", "gym", "otot", "lari", "bola", "atlet",
               "pertandingan", "juara", "fitness", "workout", "sepak"],
    "food": ["makan", "makanan", "masak", "resep", "kuliner", "enak", "pedas",
             "restoran", "warung", "rasa", "bumbu", "dapur"],
    "travel": ["liburan", "wisata", "pantai", "gunung", "traveling", "jalan-jalan",
               "pesawat", "hotel", "destinasi", "backpacker", "negara"],
    "music": ["musik", "lagu", "nyanyi", "band", "gitar", "konser", "album",
              "penyanyi", "melodi", "nada", "rekaman"],
    "gaming": ["game", "gaming", "main", "mabar", "rank", "push", "server",
               "karakter", "skin", "esport", "mobile legend", "valorant"],
    "health": ["sehat", "penyakit", "dokter", "obat", "tidur", "stres",
               "mental", "diet", "nutrisi", "tubuh", "imun"],
    "motivation": ["semangat", "mimpi", "sukses", "gagal", "bangkit", "berjuang",
                   "usaha", "konsisten", "disiplin", "mindset", "tujuan", "goal",
                   "menyerah", "berani", "yakin"],
    "drama": ["sedih", "nangis", "kecewa", "marah", "trauma", "sakit", "kehilangan",
              "menyesal", "takut", "cemas", "konflik", "masalah"],
    "lifestyle": ["hidup", "rutinitas", "kebiasaan", "keluarga", "teman", "rumah",
                  "gaya", "fashion", "belanja", "hobi", "santai"],
}

DEFAULT_GENRE = "motivation"


def detect_genre_keywords(text: str) -> tuple[str, dict[str, int]]:
    """Genre dari hitungan kata kunci (tanpa AI). Return (genre, skor)."""
    t = " " + re.sub(r"[^a-z0-9\s]", " ", (text or "").lower()) + " "
    scores: dict[str, int] = {}
    for genre, kws in GENRE_KEYWORDS.items():
        n = 0
        for kw in kws:
            n += t.count(f" {kw}")
        if n:
            scores[genre] = n
    if not scores:
        return DEFAULT_GENRE, {}
    best = max(scores.items(), key=lambda kv: kv[1])[0]
    return best, dict(sorted(scores.items(), key=lambda kv: -kv[1]))


async def detect_genre_ai(text: str) -> str | None:
    """Genre via AI (lebih akurat untuk konten campuran). None kalau gagal."""
    try:
        from .hydra import gateway
    except Exception:
        return None
    genres = ", ".join(GENRE_CATEGORIES)
    prompt = (
        "Tentukan GENRE utama video dari transkrip berikut. "
        f"Pilih SATU dari daftar: {genres}.\n\n"
        f"Transkrip (potongan):\n{text[:4000]}\n\n"
        'Balas HANYA JSON: {"genre": "...", "confidence": 0-100, "reason": "singkat"}'
    )
    try:
        raw = await gateway.chat(
            [{"role": "system", "content": "Kamu klasifikator genre video. Jawab JSON valid saja."},
             {"role": "user", "content": prompt}],
            temperature=0.1, max_tokens=200,
        )
        i, j = raw.find("{"), raw.rfind("}")
        if i == -1 or j <= i:
            return None
        data = json.loads(raw[i:j + 1])
        g = str(data.get("genre", "")).strip().lower()
        return g if g in GENRE_CATEGORIES else None
    except Exception:
        return None


async def detect_genre(text: str, use_ai: bool = True) -> dict[str, Any]:
    """Genre final + kategori & emoji yang relevan."""
    kw_genre, scores = detect_genre_keywords(text)
    genre = None
    if use_ai:
        genre = await detect_genre_ai(text)
    source = "ai" if genre else "keyword"
    genre = genre or kw_genre
    return {
        "genre": genre,
        "source": source,
        "categories": GENRE_CATEGORIES.get(genre, GENRE_CATEGORIES[DEFAULT_GENRE]),
        "emoji": GENRE_EMOJI.get(genre, GENRE_EMOJI[DEFAULT_GENRE]),
        "keyword_scores": scores,
    }
