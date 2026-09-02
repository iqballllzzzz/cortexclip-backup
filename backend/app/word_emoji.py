"""WORD_EMOJI — port EXACT dari src/components/live-caption-overlay.tsx (WORD_EMOJI).

Parity emoji: kata kunci → emoji yang SAMA dengan yang ditampilkan preview.
Jangan edit manual di dua tempat; frontend tetap sumber kebenaran.
"""
from __future__ import annotations

import re

WORD_EMOJI: dict[str, str] = {
    "money": "💰", "cash": "💰", "rich": "💰", "uang": "💰", "duit": "💰", "cuan": "💰",
    "kaya": "💰", "juta": "💰", "miliar": "💰", "rupiah": "💰", "gaji": "💰", "harga": "💰",
    "fire": "🔥", "api": "🔥", "panas": "🔥", "viral": "🔥", "gila": "🔥", "heboh": "🔥",
    "win": "🏆", "menang": "🏆", "juara": "🏆", "sukses": "🏆", "berhasil": "🏆",
    "best": "⭐", "terbaik": "⭐", "bagus": "⭐", "keren": "⭐", "top": "⭐",
    "love": "❤️", "cinta": "❤️", "hati": "❤️",
    "rocket": "🚀", "naik": "🚀", "gas": "🚀", "terbang": "🚀",
    "brain": "🧠", "pintar": "🧠", "cerdas": "🧠", "pikir": "🧠",
    "fast": "⚡", "cepat": "⚡", "kilat": "⚡",
    "strong": "💪", "kuat": "💪", "otot": "💪",
    "laugh": "😂", "lucu": "😂", "haha": "😂", "ketawa": "😂",
    "sad": "😢", "nangis": "😢", "sedih": "😢",
    "angry": "😡", "marah": "😡", "emosi": "😡",
    "food": "🍽️", "makan": "🍽️", "makanan": "🍽️", "enak": "🍽️",
    "gym": "🏋️", "olahraga": "🏋️", "latihan": "🏋️",
    "travel": "✈️", "liburan": "✈️", "jalan": "✈️",
    "king": "👑", "raja": "👑", "boss": "👑",
    "idea": "💡", "solusi": "💡", "trik": "💡",
    "warning": "⚠️", "hatihati": "⚠️", "bahaya": "⚠️", "awas": "⚠️",
    "yes": "✅", "bener": "✅", "betul": "✅", "setuju": "✅",
    "no": "❌", "salah": "❌", "jangan": "❌",
    "shock": "😱", "kaget": "😱", "kagetbanget": "😱",
}


def normalize_token(text: str) -> str:
    """Mirror normalizeToken() frontend."""
    return re.sub(r"[^a-z0-9%]", "", (text or "").lower())


def word_emoji(word: str) -> str | None:
    """Mirror wordEmoji() frontend — emoji utk kata kunci, null selain itu."""
    return WORD_EMOJI.get(normalize_token(word))
