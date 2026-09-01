"""AI Ikon & B-Roll placement — port konsep Supoclip (broll.py) ke Hydra.

Saat user aktifkan "Ikon & B-Roll":
1. Transkrip klip dianalisis AI (via Hydra gateway) → daftar sisipan:
   [{time_start, time_end, icon, side, animation, broll_url, emoji?}]
   contoh output: "pada menit 0:12 munculkan ikon api di sisi kanan dengan
   animasi slide-in dari kanan, lalu b-roll kota di 0:20".
2. Kalau AI gagal (rate limit) → fallback deterministik dari keyword
   transkrip via kategori broll-assets.json (match keyword per kata).

Output dipakai render: overlay ikon animasi (ASS/PIL) + sisipan b-roll.
"""
from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Any

# Manifest kategori (mirror frontend src/data/broll-assets.json)
BROLL_MANIFEST_PATH = Path(__file__).parent.parent / "data" / "broll-assets.json"


def load_manifest() -> dict[str, Any]:
    try:
        with open(BROLL_MANIFEST_PATH) as f:
            data = json.load(f)
        return {c["id"]: c for c in data.get("categories", [])}
    except Exception:
        return {}


# keyword → kategori (untuk fallback deterministik)
KEYWORD_CATEGORY: dict[str, str] = {}
for _cid, _cat in load_manifest().items():
    for kw in _cat.get("keywords", []):
        KEYWORD_CATEGORY[kw.lower()] = _cid

# Padanan Indonesia (user Indonesia — konten transkrip banyak bahasa Indonesia)
KEYWORD_CATEGORY.update({
    "uang": "money", "cuan": "money", "kaya": "money", "miskin": "money",
    "duit": "money", "rugi": "money", "untung": "money", "modal": "money",
    "bisnis": "money", "investasi": "money", "saham": "money", "harga": "money",
    "juta": "money", "miliar": "money", "triliun": "money", "rupiah": "money",
    "gaji": "money", "utang": "money", "tabungan": "money", "bank": "money",
    "api": "fire", "bakar": "fire", "panas": "fire", "viral": "fire",
    "meledak": "fire", "heboh": "fire", "gila": "fire", "keren": "fire",
    "menang": "success", "juara": "success", "sukses": "success",
    "berhasil": "success", "kalah": "success", "trofi": "success",
    "target": "success", "pencapaian": "success", "terbaik": "success",
    "teknologi": "tech", "ai": "tech", "robot": "tech", "komputer": "tech",
    "kode": "tech", "aplikasi": "tech", "software": "tech", "data": "tech",
    "kota": "city", "jakarta": "city", "jalan": "city", "gedung": "city",
    "macet": "city", "metropolitan": "city", " perkotaan": "city",
    "alam": "nature", "hutan": "nature", "laut": "nature", "gunung": "nature",
    "santai": "nature", "tenang": "nature", "pantai": "nature", "indah": "nature",
    "gym": "fitness", "olahraga": "fitness", "latihan": "fitness",
    "otot": "fitness", "lari": "fitness", "sehat": "fitness", "bugar": "fitness",
    "makan": "food", "makanan": "food", "masak": "food", "resep": "food",
    "restoran": "food", "lezat": "food", "enak": "food", "dapur": "food",
    "traveling": "travel", "liburan": "travel", "jalan-jalan": "travel",
    "petualangan": "travel", "perjalanan": "travel", "terbang": "travel",
    "pesawat": "travel", "wisata": "travel",
    "orang": "people", "bicara": "people", "ngomong": "people",
    "obrolan": "people", "wawancara": "people", "podcast": "people",
    "diskusi": "people", "tim": "people", "kerumunan": "people",
    "semua": "people", "kalian": "people", "kita": "people",
})


def categorize_word(word: str) -> str | None:
    """Kata → id kategori (match keyword manifest, coba singular juga)."""
    t = "".join(ch for ch in word.lower() if ch.isalnum())
    if not t:
        return None
    if t in KEYWORD_CATEGORY:
        return KEYWORD_CATEGORY[t]
    if len(t) > 4 and t.endswith("ies"):
        s = t[:-3] + "y"
        if s in KEYWORD_CATEGORY:
            return KEYWORD_CATEGORY[s]
    if len(t) > 3 and t.endswith("s") and not t.endswith("ss"):
        s = t[:-1]
        if s in KEYWORD_CATEGORY:
            return KEYWORD_CATEGORY[s]
    return None


ANIMATIONS = ["slide-left", "slide-right", "slide-up", "slide-down"]


def fallback_placements(
    words: list[dict[str, Any]],
    max_overlays: int = 4,
) -> list[dict[str, Any]]:
    """Penempatan deterministik: kata kunci kuat → overlay ikon + b-roll.

    Rate-limited: minimal jeda 6 detik antar overlay, max N per klip.
    """
    manifest = load_manifest()
    placements: list[dict[str, Any]] = []
    last_time = -10.0
    for w in words:
        if len(placements) >= max_overlays:
            break
        t = float(w.get("start", 0))
        cat_id = categorize_word(str(w.get("word", "")))
        if not cat_id or t - last_time < 6.0:
            continue
        cat = manifest.get(cat_id)
        if not cat:
            continue
        icons = cat.get("icons") or []
        brolls = cat.get("brolls") or []
        random.seed(int(t * 100) + len(cat_id))  # deterministik per klip
        side = random.choice(["right", "left"])
        animation = random.choice(ANIMATIONS)
        placements.append({
            "time_start": round(t, 2),
            "time_end": round(t + 2.5, 2),
            "word": str(w.get("word", "")),
            "category": cat_id,
            "icon": random.choice(icons) if icons else None,
            "side": side,
            "animation": animation,
            "broll_url": random.choice(brolls)["url"] if brolls else None,
            "reason": f"kata '{w.get('word')}' cocok kategori {cat_id}",
        })
        last_time = t
    return placements


async def ai_placements(
    words: list[dict[str, Any]],
    duration: float,
) -> list[dict[str, Any]] | None:
    """Minta AI (Hydra) pilih momen + kategori + animasi utk overlay.

    Return None kalau AI gagal → caller pakai fallback_placements.
    """
    try:
        from .hydra import HydraError, gateway
    except Exception:
        return None

    manifest = load_manifest()
    categories = [
        {"id": c["id"], "keywords": c.get("keywords", [])[:6]}
        for c in manifest.values()
    ]
    # ringkas transkrip: kata + waktu (maks 250 kata utk token hemat)
    compact = [
        f"{w.get('word','')}@{float(w.get('start',0)):.1f}"
        for w in words[:250]
    ]
    prompt = (
        "Kamu editor video vertikal ala OpusClip. Pilih momen TERBAIK untuk "
        "menyisipkan overlay ikon & b-roll di klip ini. Transkrip (kata@detik):\n"
        + " ".join(compact)
        + f"\n\nDurasi klip: {duration:.0f}s. Kategori tersedia: "
        + json.dumps(categories)
        + "\n\nBalas HANYA JSON array (tanpa penjelasan), format:\n"
        '[{"time_start": 12.0, "time_end": 14.5, "category": "fire", '
        '"side": "right", "animation": "slide-left"}]\n'
        "Aturan: max 4 item, jeda antar item minimal 5 detik, pilih momen "
        "kata kunci paling kuat (angka, uang, emosi, kata power)."
    )
    try:
        text = await gateway.chat(
            [{"role": "user", "content": prompt}],
            temperature=0.4,
            max_tokens=1200,
        )
        # ekstrak JSON array dari respons
        start = text.find("[")
        end = text.rfind("]")
        if start == -1 or end == -1:
            return None
        items = json.loads(text[start : end + 1])
        result = []
        for it in items[:4]:
            cat_id = str(it.get("category", ""))
            cat = manifest.get(cat_id)
            if not cat:
                continue
            random.seed(int(float(it.get("time_start", 0)) * 100))
            icons = cat.get("icons") or []
            brolls = cat.get("brolls") or []
            result.append({
                "time_start": float(it.get("time_start", 0)),
                "time_end": float(it.get("time_end", 0)),
                "category": cat_id,
                "icon": random.choice(icons) if icons else None,
                "side": str(it.get("side", "right")),
                "animation": str(it.get("animation", "slide-left")),
                "broll_url": random.choice(brolls)["url"] if brolls else None,
                "reason": f"AI: {it.get('category')}",
            })
        return result or None
    except Exception:
        return None


ICON_EMOJI = {  # noqa: N806 — dipakai juga modul render_clip (PNG overlay)
        "flame": "🔥", "dollar-sign": "💵", "banknote": "💵", "trending-up": "📈",
        "trending-down": "📉", "trophy": "🏆", "rocket": "🚀", "brain": "🧠",
        "heart": "❤️", "zap": "⚡", "star": "⭐", "crown": "👑", "target": "🎯",
        "gift": "🎁", "thumbs-up": "👍", "briefcase": "💼", "chart-column-big": "📊",
        "chart-no-axes-column": "📊", "bitcoin": "🪙", "coins": "🪙", "gem": "💎",
        "shield": "🛡️", "lightbulb": "💡", "globe": "🌍", "plane": "✈️", "car": "🚗",
        "home": "🏠", "clock": "⏰", "hourglass": "⏳", "fire": "🔥",
        "party-popper": "🎉", "warning": "⚠️", "check": "✅", "x": "❌",
        "muscle": "💪", "fork-and-knife": "🍽️", "dumbbell": "🏋️", "camera": "📷",
        "clapperboard": "🎬", "music": "🎵", "headphones": "🎧", "gamepad-2": "🎮",
        "smartphone": "📱", "laptop": "💻", "wifi": "📶", "sun": "☀️", "moon": "🌙",
        "cloud": "☁️", "leaf": "🍃", "flower": "🌸", "mountain": "⛰️", "waves": "🌊",
        "utensils": "🍽️", "coffee": "☕", "pizza": "🍕", "cake": "🎂",
        "laugh": "😂", "smile": "😊", "angry": "😡", "sad": "😢", "surprised": "😮",
        "cool": "😎", "party": "🥳", "money": "💰", "bag": "👜", "shirt": "👕",
    }

def overlay_to_ass(
    placements: list[dict[str, Any]],
    video_width: int = 1080,
    video_height: int = 1920,
) -> str:
    """Konversi placements → event ASS overlay (emoji besar beranimasi).

    Ikon lucide dirender sebagai emoji padanan (libass + Noto Color Emoji)
    dengan animasi masuk sesuai 'animation' — translasi via \\move/\\t.
    """

    def ass_time(seconds: float) -> str:
        s = max(0.0, float(seconds))
        h = int(s // 3600); m = int((s % 3600) // 60); sec = int(s % 60)
        cs = int(round((s - int(s)) * 100))
        if cs >= 100: cs = 99
        return f"{h}:{m:02d}:{sec:02d}.{cs:02d}"

    events = []
    for p in placements:
        icon = str(p.get("icon") or "")
        emoji = ICON_EMOJI.get(icon, "✨")
        ts = float(p.get("time_start", 0))
        te = max(ts + 0.5, float(p.get("time_end", ts + 2.5)))
        side = p.get("side", "right")
        anim = p.get("animation", "slide-left")

        # posisi dasar: samping kanan/kiri area tengah (hindari subtitle bawah)
        if side == "right":
            base_x, base_y = int(video_width * 0.74), int(video_height * 0.38)
        else:
            base_x, base_y = int(video_width * 0.26), int(video_height * 0.38)
        fs = int(video_width * 0.14)  # ukuran ikon ~14% lebar

        # animasi masuk (0.45s) + hold + keluar fade
        if anim == "slide-left":   # dari kanan ke kiri
            move = f"\\move({base_x + 220},{base_y},{base_x},{base_y},0,450)"
        elif anim == "slide-right": # dari kiri ke kanan
            move = f"\\move({base_x - 220},{base_y},{base_x},{base_y},0,450)"
        elif anim == "slide-up":    # dari bawah ke atas
            move = f"\\move({base_x},{base_y + 260},{base_x},{base_y},0,450)"
        else:                       # slide-down: dari atas ke bawah
            move = f"\\move({base_x},{base_y - 260},{base_x},{base_y},0,450)"

        events.append(
            f"Dialogue: 1,{ass_time(ts)},{ass_time(te)},IconOverlay,,0,0,0,,"
            f"{{{move}\\fad(120,180)\\fnNoto Color Emoji\\fs{fs}\\an5}}{emoji}"
        )

    if not events:
        return ""
    header = (
        "[Script Info]\nScriptType: v4.00+\n"
        f"PlayResX: {video_width}\nPlayResY: {video_height}\n"
        "WrapStyle: 2\nScaledBorderAndShadow: yes\n\n"
        "[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, "
        "OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, "
        "ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
        "Alignment, MarginL, MarginR, MarginV, Encoding\n"
        "Style: IconOverlay,Noto Color Emoji,80,&H00FFFFFF,&H00FFFFFF,"
        "&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,60,60,60,1\n\n"
        "[Events]\n"
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    )
    return header + "\n".join(events) + "\n"


async def compute_placements(
    words: list[dict[str, Any]],
    duration: float,
    use_ai: bool = True,
) -> list[dict[str, Any]]:
    """AI dulu; fallback deterministik kalau AI gagal."""
    if use_ai:
        ai = await ai_placements(words, duration)
        if ai:
            return ai
    return fallback_placements(words)
