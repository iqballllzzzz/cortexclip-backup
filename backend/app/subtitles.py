r"""CortexClip caption engine — port arsitektur Supoclip (FujiwaraChoki/supoclip).

Dibangun ulang DARI NOL berdasarkan pelajaran kedua project referensi:
- Supoclip: renderer ASS karaoke OpusClip-style (caption_templates.py +
  build_assemblyai_ass_subtitles + emoji_captions.py + font_registry.py).
- OpenShorts: blok kata ala CapCut + margin aman.

KEPUTUSAN DESAIN KUNCI (dari Supoclip, teruji):
1. **JANGAN men-scale kata aktif** — scaling mengubah advance width kata,
   baris center-anchored reflow & terlihat BERGETAR tiap kata pop. Kata
   aktif dibedakan via WARNA + optional pill (word_box) saja.
2. Pop = one-shot entrance baris (\fscx92→100, 140ms) hanya di event kata
   pertama tiap chunk — bukan per kata.
3. PlayRes = ukuran video output asli + font size di-scale dari lebar video
   (`get_scaled_font_size`: base * width/560, clamp 26..132) → chunky &
   konsisten di semua resolusi.
4. Outline di-scale dengan font (`font_px * stroke/26`) → tepi tebal tetap
   proporsional; shadow = font_px//20.
5. Word box (pill): \3c box_color \bord (outline+2, min font_px//5).
6. Emoji kontekstual via font Noto Color Emoji (\fn override per glyph),
   rate-limited (max 8/klip, gap 3 kata, repeat gap 8).
7. Emphasis power-words + angka/percent → warna emphasis.
8. Karaoke: 1 event per KATA (event berjalan sampai kata berikutnya mulai),
   chunk max_words_per_line (3-6 kata).
9. Posisi \pos(x,y) eksplisit center + safe area (padding 5% atas / 10% bawah).
10. fontsdir eksplisit ke app/fonts (font bundle repo) — tidak bergantung cache
    fontconfig sistem.
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Optional

# ---------------------------------------------------------------------------
# Font registry — font bundle di app/fonts (ala Supoclip font_registry.py)
# ---------------------------------------------------------------------------
FONTS_DIR = Path(__file__).parent / "fonts"

SUPPORTED_FONT_EXTENSIONS = (".ttf", ".otf")

FONTS: dict[str, str] = {
    # key dibersihkan → family name yang dipakai libass
    "theboldfont": "THE BOLD FONT",
    "tiktoksans": "TikTok Sans",
    "tiktoksans-regular": "TikTok Sans",
    "bangers": "Bangers",
    "bebasneue": "Bebas Neue",
    "poppinsextrabold": "Poppins",
    "poppins": "Poppins",
    "archivoblack": "Archivo Black",
    "anton": "Anton",
    "oswald": "Oswald",
    "barlowcondensed": "Barlow Condensed",
    "montserrat": "Montserrat",
    "inter": "Inter",
    "notoserif": "Noto Serif",
    "noto serif": "Noto Serif",
    "courierprime": "Courier Prime",
    "courier": "Courier Prime",
}

EMOJI_FONT_NAME = "Noto Color Emoji"


def resolve_font(name: str) -> str:
    """Resolve nama font (case-insensitive, alias) → family libass."""
    key = re.sub(r"[^a-z0-9 -]", "", str(name or "").lower()).strip()
    return FONTS.get(key, str(name or "THE BOLD FONT"))


def fonts_dir() -> str:
    return str(FONTS_DIR)


def emoji_rendering_supported() -> bool:
    """True kalau Noto Color Emoji tersedia (system atau bundle)."""
    try:
        import subprocess
        r = subprocess.run(
            ["fc-list"], capture_output=True, text=True, timeout=5,
        )
        return "Noto Color Emoji" in (r.stdout or "")
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Skala font ala Supoclip
# ---------------------------------------------------------------------------
def get_scaled_font_size(base_font_size: int, video_width: int) -> int:
    """Parity frontend: LiveCaptionOverlay pakai fontSize = base*0.42*(width/360).

    Formula lama (base*width/560) menghasilkan font ~53% lebih besar dari
    preview — penyebab subtitle di RESULT "gede banget sampai ngelebihin ujung".
    """
    scaled = round(base_font_size * 0.42 * (video_width / 360.0))
    return max(12, min(96, scaled))


def get_safe_vertical_position(video_height: int, text_height: int, position_y: float) -> int:
    """Titik TENGAH teks (Alignment=5 middle-center), clamp ke safe area.

    Parity preview: outer div `top: position%` + `translateY(-50%)` →
    pusat teks tepat di position% tinggi frame (dulu digeser -h/2 → 18px
    lebih tinggi dari preview).
    """
    min_top = max(40, int(video_height * 0.05)) + text_height // 2
    min_bottom = max(120, int(video_height * 0.10))
    desired_y = int(video_height * position_y)
    max_y = video_height - min_bottom - text_height // 2
    return max(min_top, min(desired_y, max_y))


# ---------------------------------------------------------------------------
# Emoji + keyword emphasis (port emoji_captions.py Supoclip)
# ---------------------------------------------------------------------------
EMOJI_KEYWORD_MAP: dict[str, str] = {
    # money / business
    "money": "💰", "cash": "💵", "dollar": "💵", "dollars": "💵", "rich": "🤑",
    "wealth": "💰", "wealthy": "💰", "millionaire": "🤑", "billionaire": "🤑",
    "million": "💰", "billion": "💰", "profit": "📈", "revenue": "📈",
    "income": "💵", "salary": "💸", "price": "🏷️", "cost": "💲", "free": "🆓",
    "invest": "📊", "investment": "📊", "stock": "📈", "stocks": "📈",
    "crypto": "🪙", "bitcoin": "₿", "business": "💼", "company": "🏢",
    "startup": "🚀", "deal": "🤝", "sale": "🛒", "buy": "🛒", "sell": "💸",
    "bank": "🏦", "tax": "🧾", "taxes": "🧾", "budget": "📒", "debt": "💳",
    "fund": "💰", "uang": "💰", "rugi": "📉", "untung": "📈", "modal": "💰",
    # growth / success
    "growth": "📈", "grow": "📈", "success": "🏆", "win": "🏆",
    "winning": "🏆", "winner": "🥇", "won": "🏆", "goal": "🎯", "goals": "🎯",
    "target": "🎯", "achieve": "✅", "result": "✅", "results": "✅",
    "best": "🥇", "first": "🥇", "top": "⬆️", "champion": "🏆",
    "boost": "🚀", "rocket": "🚀", "naik": "📈", "sukses": "🏆",
    # ideas / mind
    "idea": "💡", "ideas": "💡", "think": "🤔", "thinking": "🤔",
    "thought": "💭", "smart": "🧠", "genius": "🧠", "brain": "🧠",
    "mind": "🧠", "learn": "📚", "study": "📚", "knowledge": "🧠",
    "book": "📖", "books": "📚", "read": "📖", "question": "❓",
    "answer": "💡", "secret": "🤫", "truth": "💯", "fact": "📌", "facts": "💯",
    "remember": "🧠", "focus": "🎯", "rahasia": "🤫", "benar": "✅",
    # emotion / hype
    "love": "❤️", "loved": "❤️", "heart": "❤️", "amazing": "🤩",
    "incredible": "🤯", "insane": "🤯", "crazy": "🤯", "wow": "😮",
    "shocking": "😱", "scary": "😱", "fear": "😱", "happy": "😄",
    "sad": "😢", "angry": "😡", "fire": "🔥", "hot": "🔥", "lit": "🔥",
    "cool": "😎", "perfect": "👌", "beautiful": "😍", "favorite": "⭐",
    "epic": "🤩", "magic": "✨", "powerful": "💪", "power": "⚡",
    "strong": "💪", "energy": "⚡", "stop": "✋", "warning": "⚠️",
    "danger": "⚠️", "boom": "💥", "explode": "💥", "gila": "🤯",
    "hebat": "🤩", "keren": "😎", "bagus": "👌", "cinta": "❤️",
    # time
    "time": "⏰", "today": "📅", "tomorrow": "📅", "now": "⏰", "fast": "⚡",
    "quick": "⚡", "quickly": "⚡", "minute": "⏱️", "minutes": "⏱️",
    "hour": "⏰", "hours": "⏰", "day": "📅", "days": "📅", "year": "📆",
    "years": "📆", "future": "🔮", "forever": "♾️", "deadline": "⏳",
    "waktu": "⏰", "sekarang": "⏰", "cepat": "⚡", "besok": "📅",
    # people / social
    "people": "👥", "team": "🤝", "family": "👨‍👩‍👧", "friend": "🫂",
    "friends": "🫂", "everyone": "🙌", "everybody": "🙌", "you": "👉",
    "audience": "👀", "followers": "📲", "subscribe": "🔔", "viral": "📈",
    "famous": "🌟", "customer": "🛍️", "customers": "🛍️", "boss": "💼",
    "leader": "🫡", "orang": "👥", "teman": "🫂", "semua": "🙌",
    # work / health
    "work": "💼", "working": "💼", "hustle": "💪", "grind": "💪",
    "effort": "💪", "hard": "💪", "build": "🛠️", "building": "🏗️",
    "create": "🎨", "creating": "🎨", "health": "🏥", "healthy": "🥗",
    "food": "🍽️", "eat": "🍴", "gym": "🏋️", "workout": "🏋️",
    "muscle": "💪", "sleep": "😴", "water": "💧", "run": "🏃",
    "running": "🏃", "kerja": "💼", "kesehatan": "🏥",
    # tech / world
    "ai": "🤖", "robot": "🤖", "tech": "💻", "technology": "💻",
    "computer": "💻", "phone": "📱", "internet": "🌐", "online": "🌐",
    "data": "📊", "code": "👨‍💻", "world": "🌍", "earth": "🌍",
    "global": "🌍", "space": "🚀", "science": "🔬", "game": "🎮",
    "games": "🎮", "music": "🎵", "video": "🎬", "movie": "🎬",
    "car": "🚗", "house": "🏠", "home": "🏠", "travel": "✈️",
    "light": "💡", "key": "🔑", "dunia": "🌍", "video": "🎬",
}

POWER_WORDS: set[str] = {
    "never", "always", "everything", "nothing", "everyone", "nobody", "anyone",
    "best", "worst", "most", "biggest", "huge", "massive", "tiny", "every",
    "only", "first", "last", "free", "now", "today", "instantly", "forever",
    "guaranteed", "proven", "secret", "truth", "fact", "literally", "actually",
    "exactly", "must", "need", "stop", "warning", "danger", "critical", "key",
    "important", "remember", "mistake", "wrong", "right", "perfect", "ultimate",
    "powerful", "insane", "crazy", "incredible", "amazing", "shocking", "viral",
    "million", "billion", "thousand", "percent", "double", "triple", "ten",
    # Indonesia
    "jangan", "selalu", "semua", "pasti", "gratis", "sekarang", "rahasia",
    "benar", "salah", "penting", "wajib", "terbaik", "terbesar", "cepat",
}

_NORMALIZE_RE = re.compile(r"[^a-z0-9%]+")
_NUMBER_RE = re.compile(r"\d")


def normalize_token(text: str) -> str:
    return _NORMALIZE_RE.sub("", (text or "").lower())


def _singularize(token: str) -> str:
    if len(token) > 4 and token.endswith("ies"):
        return token[:-3] + "y"
    if len(token) > 4 and token.endswith("es") and not token.endswith("ses"):
        return token[:-2]
    if len(token) > 3 and token.endswith("s") and not token.endswith("ss"):
        return token[:-1]
    return token


def _lookup_emoji(token: str) -> Optional[str]:
    if not token:
        return None
    if token in EMOJI_KEYWORD_MAP:
        return EMOJI_KEYWORD_MAP[token]
    singular = _singularize(token)
    if singular != token and singular in EMOJI_KEYWORD_MAP:
        return EMOJI_KEYWORD_MAP[singular]
    return None


def annotate_caption_words(
    words: list[dict[str, Any]],
    *,
    enable_emoji: bool = True,
    enable_emphasis: bool = True,
    max_emojis: int = 8,
    min_word_gap: int = 3,
    repeat_gap: int = 8,
) -> tuple[dict[int, str], set[int]]:
    """Annotate kata dengan emoji (rate-limited) + emphasis power-words."""
    emoji_by_index: dict[int, str] = {}
    emphasis_indices: set[int] = set()
    if not words:
        return emoji_by_index, emphasis_indices

    last_emoji_word = -(min_word_gap + 1)
    recent_emoji: dict[str, int] = {}
    emoji_count = 0

    for idx, word in enumerate(words):
        raw = str(word.get("word", word.get("text", "")))
        token = normalize_token(raw)
        if not token:
            continue

        is_number = bool(_NUMBER_RE.search(token))
        emoji = _lookup_emoji(token) if enable_emoji else None

        if enable_emphasis and (emoji or token in POWER_WORDS or is_number):
            emphasis_indices.add(idx)

        if not emoji or emoji_count >= max_emojis:
            continue
        if idx - last_emoji_word < min_word_gap:
            continue
        if idx - recent_emoji.get(emoji, -(repeat_gap + 1)) < repeat_gap:
            continue

        emoji_by_index[idx] = emoji
        emphasis_indices.add(idx)
        last_emoji_word = idx
        recent_emoji[emoji] = idx
        emoji_count += 1

    return emoji_by_index, emphasis_indices


# ---------------------------------------------------------------------------
# Template caption ala Supoclip (caption_templates.py)
# ---------------------------------------------------------------------------
CAPTION_TEMPLATES: dict[str, dict[str, Any]] = {
    "default": {
        "name": "Default",
        "font_family": "THE BOLD FONT",
        "font_size": 32,
        "font_color": "#FFFFFF",
        "highlight_color": "#FFE000",
        "emphasis_color": "#FFE000",
        "stroke_color": "#000000",
        "stroke_width": 3,
        "background": False, "background_color": None,
        "word_box": False, "word_box_color": None,
        "animation": "karaoke", "word_pop": True,
        "emoji": True, "uppercase": False,
        "shadow": True, "glow": False,
        "max_words_per_line": 4, "position_y": 0.80,
    },
    "hormozi": {
        "name": "Hormozi",
        "font_family": "THE BOLD FONT",
        "font_size": 38,
        "font_color": "#FFFFFF",
        "highlight_color": "#00FF66",
        "emphasis_color": "#FFE000",
        "stroke_color": "#000000",
        "stroke_width": 4,
        "background": False, "background_color": None,
        "word_box": True, "word_box_color": "#00BF49",
        "animation": "karaoke", "word_pop": True,
        "emoji": True, "uppercase": True,
        "shadow": True, "glow": False,
        "max_words_per_line": 3, "position_y": 0.74,
    },
    "mrbeast": {
        "name": "MrBeast",
        "font_family": "THE BOLD FONT",
        "font_size": 42,
        "font_color": "#FFFF00",
        "highlight_color": "#FF2D2D",
        "emphasis_color": "#FFFFFF",
        "stroke_color": "#000000",
        "stroke_width": 5,
        "background": False, "background_color": None,
        "word_box": False, "word_box_color": None,
        "animation": "karaoke", "word_pop": True,
        "emoji": True, "uppercase": True,
        "shadow": True, "glow": False,
        "max_words_per_line": 3, "position_y": 0.70,
    },
    "tiktok": {
        "name": "TikTok Pop",
        "font_family": "TikTok Sans",
        "font_size": 34,
        "font_color": "#FFFFFF",
        "highlight_color": "#FE2C55",
        "emphasis_color": "#FE2C55",
        "stroke_color": "#000000",
        "stroke_width": 3,
        "background": False, "background_color": None,
        "word_box": False, "word_box_color": None,
        "animation": "karaoke", "word_pop": True,
        "emoji": True, "uppercase": False,
        "shadow": True, "glow": False,
        "max_words_per_line": 4, "position_y": 0.78,
    },
    "neon": {
        "name": "Neon Glow",
        "font_family": "THE BOLD FONT",
        "font_size": 36,
        "font_color": "#00FFFF",
        "highlight_color": "#FF00FF",
        "emphasis_color": "#FF00FF",
        "stroke_color": "#002A6B",
        "stroke_width": 2,
        "background": False, "background_color": None,
        "word_box": False, "word_box_color": None,
        "animation": "karaoke", "word_pop": True,
        "emoji": False, "uppercase": False,
        "shadow": False, "glow": True,
        "max_words_per_line": 4, "position_y": 0.76,
    },
    "minimal": {
        "name": "Clean Minimal",
        "font_family": "TikTok Sans",
        "font_size": 26,
        "font_color": "#FFFFFF",
        "highlight_color": "#FFFFFF",
        "emphasis_color": None,
        "stroke_color": None,
        "stroke_width": 0,
        "background": True, "background_color": "#00000080",
        "word_box": False, "word_box_color": None,
        "animation": "fade", "word_pop": False,
        "emoji": False, "uppercase": False,
        "shadow": False, "glow": False,
        "max_words_per_line": 6, "position_y": 0.82,
    },
    "comic": {
        "name": "Comic Bang",
        "font_family": "Bangers",
        "font_size": 40,
        "font_color": "#FFE600",
        "highlight_color": "#FF2200",
        "emphasis_color": "#FFFFFF",
        "stroke_color": "#000000",
        "stroke_width": 5,
        "background": False, "background_color": None,
        "word_box": False, "word_box_color": None,
        "animation": "bounce", "word_pop": False,
        "emoji": True, "uppercase": True,
        "shadow": True, "glow": False,
        "max_words_per_line": 3, "position_y": 0.70,
    },
    "podcast": {
        "name": "Sermon Elegan",
        "font_family": "TikTok Sans",
        "font_size": 28,
        "font_color": "#FFFFFF",
        "highlight_color": "#FFB800",
        "emphasis_color": "#FFB800",
        "stroke_color": "#1A1A1A",
        "stroke_width": 2,
        "background": False, "background_color": None,
        "word_box": False, "word_box_color": None,
        "animation": "karaoke", "word_pop": False,
        "emoji": False, "uppercase": False,
        "shadow": False, "glow": False,
        "max_words_per_line": 5, "position_y": 0.80,
    },
    "typewriter": {
        "name": "Typewriter",
        "font_family": "Courier Prime",
        "font_size": 30,
        "font_color": "#D8FFD0",
        "highlight_color": "#4AF626",
        "emphasis_color": "#4AF626",
        "stroke_color": "#0A3300",
        "stroke_width": 3,
        "background": False, "background_color": None,
        "word_box": True, "word_box_color": "#0A3300",
        "animation": "karaoke", "word_pop": False,
        "emoji": False, "uppercase": False,
        "shadow": False, "glow": False,
        "max_words_per_line": 5, "position_y": 0.78,
    },
    "gaming": {
        "name": "Gaming Energy",
        "font_family": "Anton",
        "font_size": 38,
        "font_color": "#FFFFFF",
        "highlight_color": "#7CFC00",
        "emphasis_color": "#7CFC00",
        "stroke_color": "#5A00FF",
        "stroke_width": 4,
        "background": False, "background_color": None,
        "word_box": False, "word_box_color": None,
        "animation": "karaoke", "word_pop": True,
        "emoji": True, "uppercase": True,
        "shadow": True, "glow": True,
        "max_words_per_line": 3, "position_y": 0.72,
    },
}

TEMPLATE_DEFAULTS: dict[str, Any] = {
    "highlight_color": "#FFE000",
    "emphasis_color": None,
    "stroke_color": "#000000",
    "stroke_width": 3,
    "background": False,
    "background_color": None,
    "word_box": False,
    "word_box_color": None,
    "animation": "karaoke",
    "word_pop": True,
    "emoji": True,
    "uppercase": False,
    "shadow": True,
    "glow": False,
    "max_words_per_line": 4,
    "position_y": 0.80,
    "font_family": "THE BOLD FONT",
    "font_size": 32,
    "font_color": "#FFFFFF",
}


def get_template(name: str) -> dict[str, Any]:
    template = CAPTION_TEMPLATES.get(name, CAPTION_TEMPLATES["default"])
    merged = dict(TEMPLATE_DEFAULTS)
    merged.update(template)
    return merged


# ---------------------------------------------------------------------------
# Warna ASS
# ---------------------------------------------------------------------------
_HEX_RE = re.compile(r"^[0-9A-Fa-f]{6,8}$")


def hex_to_ass_color(hex_color: Optional[str], fallback: str = "FFFFFF") -> str:
    """#RRGGBB (atau #RRGGBBAA) → ASS &HAABBGGRR. Fallback kalau invalid."""
    clean = str(hex_color or "").lstrip("#")
    if not _HEX_RE.match(clean):
        clean = fallback.lstrip("#")
    if len(clean) == 8:
        alpha_hex = clean[6:8]
        rgb = clean[0:6]
    else:
        alpha_hex = "00"
        rgb = clean[0:6]
    r, g, b = rgb[0:2], rgb[2:4], rgb[4:6]
    try:
        alpha = int(alpha_hex, 16)
    except ValueError:
        alpha = 0
    return f"&H{alpha:02X}{b}{g}{r}".upper()


def ass_timestamp(seconds: float) -> str:
    """Detik → ASS H:MM:SS.cc."""
    s = max(0.0, float(seconds))
    h = int(s // 3600)
    m = int((s % 3600) // 60)
    sec = int(s % 60)
    cs = int(round((s - int(s)) * 100))
    if cs >= 100:
        cs = 99
    return f"{h}:{m:02d}:{sec:02d}.{cs:02d}"


def escape_ass_text(value: str) -> str:
    """Netralkan karakter yang bisa memulai override block ASS."""
    return (
        str(value)
        .replace("\\", "/")
        .replace("{", "(")
        .replace("}", ")")
    )


# ---------------------------------------------------------------------------
# Builder utama — port build_assemblyai_ass_subtitles Supoclip
# ---------------------------------------------------------------------------
def build_ass(
    words: list[dict[str, Any]],
    style: dict[str, Any] | None = None,
    video_width: int = 1080,
    video_height: int = 1920,
    server_render: bool = True,
) -> str:
    """Bangun ASS karaoke OpusClip-style.

    words: [{word|text, start, end}] — timing relatif klip (word-level JSON).
    style: {"preset": "hormozi", ...override} — key template Supoclip.
    server_render=True (default): emoji teks tidak disisipkan (PNG overlay
    terpisah yang menggambar emoji di render final).
    """
    if isinstance(style, str):
        try:
            style = json.loads(style)
        except Exception:
            style = {}
    style = style or {}

    template_name = str(style.get("preset", "default"))
    template = get_template(template_name)

    # --- override dari style dict (key Supoclip) ---
    effective_font_family = str(style.get("font_family") or template["font_family"])
    effective_font_size = int(style.get("font_size") or template["font_size"])
    effective_font_color = str(style.get("font_color") or template["font_color"])

    animation = template.get("animation", "karaoke")
    uppercase = bool(template.get("uppercase"))
    word_pop = bool(template.get("word_pop", True))
    word_box = bool(template.get("word_box"))
    glow = bool(template.get("glow"))
    has_outline = template.get("stroke_color") is not None
    # emoji: template boleh men-disable, tapi override eksplisit dari user (editor)
    # selalu menang — style["emoji"] dikirim frontend (toggle "Emoji pada subtitle")
    template_emoji = bool(template.get("emoji", True))
    user_emoji = style.get("emoji")
    if user_emoji is not None:
        template_emoji = bool(user_emoji)
    enable_emoji = template_emoji and emoji_rendering_supported()
    enable_emphasis = animation != "none"

    # posisi: style.position (persen 0-100 dari atas) → position_y (0-1)
    # default dari template
    if "position" in style and style["position"] is not None:
        try:
            position_y = float(style["position"]) / 100.0
        except (TypeError, ValueError):
            position_y = float(template.get("position_y", 0.80))
    else:
        position_y = float(template.get("position_y", 0.80))
    position_y = max(0.08, min(0.92, position_y))

    # opacity (0..1) dari style — turunkan alpha teks (kata non-aktif & aktif)
    try:
        style_opacity = float(style.get("opacity", 1.0))
    except (TypeError, ValueError):
        style_opacity = 1.0
    style_opacity = max(0.1, min(1.0, style_opacity))
    # alpha ASS: 00 = opaque, FF = transparan → konversi
    alpha_hex = f"{int(round((1.0 - style_opacity) * 255)):02X}"
    clean_base = str(effective_font_color or "").lstrip("#")
    if not _HEX_RE.match(clean_base):
        clean_base = "FFFFFF"
    if len(clean_base) == 8:
        clean_base = clean_base[0:6]
    primary = hex_to_ass_color(f"#{clean_base}{alpha_hex}")
    highlight = hex_to_ass_color(template.get("highlight_color"), "#FFE000")
    emphasis_color = hex_to_ass_color(
        template.get("emphasis_color") or template.get("highlight_color"), "#FFE000"
    )
    outline = hex_to_ass_color(template.get("stroke_color") or "#000000", "#000000")
    back_color = hex_to_ass_color(template.get("background_color"), "#00000080")
    box_color = hex_to_ass_color(
        template.get("word_box_color") or template.get("highlight_color"), "#00BF49"
    )

    font_px = get_scaled_font_size(effective_font_size, video_width)
    base_stroke = int(template.get("stroke_width", 3) or 0)
    # Parity stroke frontend: strokeWidth px @360 → dikali width/360
    outline_px = (
        max(base_stroke, round(base_stroke * video_width / 360.0))
        if (has_outline and base_stroke)
        else 0
    )
    shadow_px = max(2, font_px // 20) if template.get("shadow") else 0
    box_bord = max(outline_px + 2, font_px // 5)
    est_text_height = int(font_px * 1.5)
    y_pos = get_safe_vertical_position(video_height, est_text_height, position_y)
    font_name = resolve_font(effective_font_family)
    border_style = 3 if (template.get("background") and template.get("background_color")) else 1

    # --- emoji + emphasis annotation ---
    # server_render=True → emoji teks TIDAK disisipkan di ASS (libass tak bisa
    # render emoji; PNG overlay terpisah yang menggambar). Emphasis tetap.
    if not server_render:
        emoji_by_idx, emphasis_idx = annotate_caption_words(
            words, enable_emoji=enable_emoji, enable_emphasis=enable_emphasis,
        )
    else:
        _, emphasis_idx = annotate_caption_words(
            words, enable_emoji=False, enable_emphasis=enable_emphasis,
        )
        emoji_by_idx = {}

    max_words = max(1, int(template.get("max_words_per_line", 4) or 4))

    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {video_width}
PlayResY: {video_height}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,{font_name},{font_px},{primary},&H000000FF,{outline},{back_color},1,0,0,0,100,100,0,0,{border_style},{outline_px},{shadow_px},5,60,60,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    line_prefix = f"{{\\pos({video_width // 2},{y_pos})" + ("\\blur4" if glow else "") + "}"
    font_tag = f"\\fn{font_name}"

    def render_text(global_idx: int, word: dict[str, Any]) -> str:
        text = str(word.get("word", word.get("text", "")))
        if uppercase:
            text = text.upper()
        disp = escape_ass_text(text)
        emoji = emoji_by_idx.get(global_idx)
        if emoji:
            disp = f"{disp} {{\\fn{EMOJI_FONT_NAME}}}{emoji}"
        return disp

    # Kata aktif: WARNA (+ pill box) SAJA — tanpa scale (anti-getar Supoclip).
    # Kata aktif SELALU PUTIH (kontras maksimal) di atas pill berwarna —
    # jangan samakan warna teks dengan pill (bug "hijau menutupi teks").
    def active_span(disp: str) -> str:
        if word_box:
            # teks PUTIH di atas pill berwarna (kontras maksimal)
            tags = f"{font_tag}\\c&HFFFFFF&\\3c{box_color}\\bord{box_bord}\\shad0"
        else:
            tags = f"{font_tag}\\c{highlight}"
        return f"{{{tags}}}{disp}"

    def idle_span(global_idx: int, disp: str) -> str:
        color = emphasis_color if (enable_emphasis and global_idx in emphasis_idx) else primary
        tags = f"{font_tag}\\c{color}"
        if word_box:
            tags += f"\\3c{outline}\\bord{outline_px}\\shad{shadow_px}"
        return f"{{{tags}}}{disp}"

    # Entrance one-shot baris (uniform scale, center) — pop tanpa reflow
    line_entrance = "\\fscx92\\fscy92\\t(0,140,\\fscx100\\fscy100)" if word_pop else ""

    events: list[str] = []
    total = len(words)
    # PARITY preview: LiveCaptionOverlay menampilkan baris BERIKUTNYA selama
    # jeda bicara (fallback `lines.find(l => time < l[0].start)`), jadi teks
    # tidak pernah kosong. ASS lama hanya tampil [chunk.start..chunk.end] →
    # subtitle hilang di gap. Solusi: baris tampil sejak akhir chunk sebelumnya.
    prev_chunk_end = 0.0
    for chunk_start in range(0, total, max_words):
        chunk = words[chunk_start : chunk_start + max_words]
        indices = list(range(chunk_start, chunk_start + len(chunk)))
        chunk_end = float(chunk[-1]["end"])
        chunk_begin = float(chunk[0]["start"])
        # window pre-roll: dari akhir chunk sebelumnya sampai kata pertama mulai
        pre_start = min(prev_chunk_end, chunk_begin)

        if animation == "karaoke":
            # pre-roll: seluruh baris idle (belum ada kata aktif) — mirror preview
            if chunk_begin - pre_start > 0.02:
                idle_parts = [
                    idle_span(indices[j], render_text(indices[j], other))
                    for j, other in enumerate(chunk)
                ]
                entrance = f"{{{line_entrance}}}" if line_entrance else ""
                events.append(
                    f"Dialogue: 0,{ass_timestamp(pre_start)},{ass_timestamp(chunk_begin)},"
                    f"Default,,0,0,0,,{line_prefix}{entrance}{' '.join(idle_parts)}"
                )
            for local_i, word in enumerate(chunk):
                start = float(word["start"])
                end = (
                    float(chunk[local_i + 1]["start"])
                    if local_i + 1 < len(chunk)
                    else chunk_end
                )
                if end <= start:
                    end = start + 0.05
                parts = []
                for local_j, other in enumerate(chunk):
                    gj = indices[local_j]
                    disp = render_text(gj, other)
                    parts.append(active_span(disp) if local_j == local_i else idle_span(gj, disp))
                line = " ".join(parts)
                entrance = (
                    f"{{{line_entrance}}}"
                    if (line_entrance and local_i == 0 and chunk_begin - pre_start <= 0.02)
                    else ""
                )
                events.append(
                    f"Dialogue: 0,{ass_timestamp(start)},{ass_timestamp(end)},Default,,0,0,0,,{line_prefix}{entrance}{line}"
                )
        else:
            start = pre_start
            end = chunk_end
            if end <= start:
                end = start + 0.05
            spans = []
            for local_j, word in enumerate(chunk):
                gj = indices[local_j]
                disp = render_text(gj, word)
                color = emphasis_color if (enable_emphasis and gj in emphasis_idx) else primary
                spans.append(f"{{{font_tag}\\c{color}}}{disp}")
            chunk_text = " ".join(spans)

            effect = ""
            if animation == "fade":
                effect = "{\\fad(120,120)}"
            elif animation == "pop":
                effect = "{\\fscx88\\fscy88\\t(0,130,\\fscx106\\fscy106)\\t(130,250,\\fscx100\\fscy100)}"
            elif animation == "bounce":
                effect = "{\\fscx70\\fscy70\\t(0,120,\\fscx112\\fscy112)\\t(120,240,\\fscx100\\fscy100)}"
            events.append(
                f"Dialogue: 0,{ass_timestamp(start)},{ass_timestamp(end)},Default,,0,0,0,,{line_prefix}{effect}{chunk_text}"
            )
        prev_chunk_end = chunk_end

    return header + "\n".join(events) + "\n"


# ---------------------------------------------------------------------------
# SRT export (fallback)
# ---------------------------------------------------------------------------
def _srt_time(seconds: float) -> str:
    s = max(0.0, float(seconds))
    h = int(s // 3600)
    m = int((s % 3600) // 60)
    sec = int(s % 60)
    ms = int(round((s - int(s)) * 1000))
    return f"{h:02d}:{m:02d}:{sec:02d},{ms:03d}"


def build_srt(words: list[dict[str, Any]], max_words: int = 4) -> str:
    out = []
    for idx in range(0, len(words), max_words):
        chunk = words[idx : idx + max_words]
        text = " ".join(str(w.get("word", w.get("text", ""))) for w in chunk).strip()
        out.append(
            f"{idx // max_words + 1}\n{_srt_time(chunk[0]['start'])} --> "
            f"{_srt_time(chunk[-1]['end'])}\n{text}\n"
        )
    return "\n".join(out)


# ---------------------------------------------------------------------------
# Kompatibilitas lama (dipanggil render_clip.py / main.py)
# ---------------------------------------------------------------------------
DEFAULT_STYLE = {
    "preset": "default",
    "font_size": 32,
    "font_color": "#FFFFFF",
    "position": 80,  # % dari atas
}

EFFECTS = ["karaoke", "fade", "pop", "bounce", "none"]

STYLE_PRESETS: dict[str, dict[str, Any]] = {
    # dipakai endpoint /api/caption-effects — ringkas untuk frontend
    name: {
        "font_family": t["font_family"],
        "font_size": t["font_size"],
        "font_color": t["font_color"],
        "highlight_color": t["highlight_color"],
        "animation": t["animation"],
        "word_box": t.get("word_box", False),
        "emoji": t.get("emoji", True),
        "uppercase": t.get("uppercase", False),
        "position": int(t.get("position_y", 0.80) * 100),
    }
    for name, t in CAPTION_TEMPLATES.items()
}
