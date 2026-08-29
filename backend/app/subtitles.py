"""Subtitle engine — karaoke ASS generation with multiple effect styles.

GOAL (permintaan user): preview di browser harus SAMA dengan hasil MP4.
Strategy: ONE source of truth = ASS subtitle file.
- The browser preview renders the same ASS timing/effect data via canvas rules
  that mirror libass behaviour for the effects we support.
- The MP4 render burns the exact same ASS file with ffmpeg (libass).
- Both consume the same `CaptionStyle` JSON, so parameters can't drift.

Effects (from OpenShorts subtitle styles + CortexClip requests):
  - classic   : accent highlight per active word, black outline
  - glow      : active word glows with accent colour
  - pop       : active word scales up
  - box       : active word sits in a coloured box
  - none
"""

from __future__ import annotations

from typing import Any

EFFECTS = ("none", "classic", "glow", "pop", "box")
FONTS = {
    "montserrat": "Montserrat",
    "anton": "Anton",
    "notoserif": "NotoSerif",
    "inter": "Inter",
    "impact": "Impact",
}


def hex_to_ass(hex_color: str, alpha: float = 1.0) -> str:
    clean = hex_color.lstrip("#")
    if len(clean) == 3:
        clean = "".join(c * 2 for c in clean)
    r, g, b = clean[0:2], clean[2:4], clean[4:6]
    a = max(0, min(255, round((1 - alpha) * 255)))
    return f"&H{a:02X}{b}{g}{r}".upper()


def format_ass_time(seconds: float) -> str:
    s = max(0.0, seconds)
    h = int(s // 3600)
    m = int((s % 3600) // 60)
    sec = s % 60
    return f"{h}:{m:02d}:{sec:05.2f}"


def chunk_words(words: list[dict[str, Any]], n: int) -> list[list[dict[str, Any]]]:
    out = []
    for i in range(0, len(words), max(1, n)):
        out.append(words[i:i + max(1, n)])
    return out


DEFAULT_STYLE = {
    "accent": "#FFD400",
    "base": "#FFFFFF",
    "outline": "#000000",
    "fontSize": 32,          # in a 1080x1920 space
    "fontName": "Montserrat",
    "wordsPerLine": 3,
    "position": 62,          # % from top
    "stroke": True,
    "bold": True,
    "uppercase": False,
    "effect": "classic",
    "opacity": 0.45,         # inactive word opacity
}


def build_ass(words: list[dict[str, Any]], style: dict[str, Any] | None = None) -> str:
    """Build an ASS subtitle file (1080x1920 canvas) with karaoke highlight.

    The active word is emphasised with \\k-style colour swap driven by the
    per-word timings; effect-specific override tags are applied per line.
    """
    s = dict(DEFAULT_STYLE)
    if style:
        s.update({k: v for k, v in style.items() if v is not None})

    font = FONTS.get(str(s["fontName"]).lower(), s["fontName"])
    # ASS on a 1080x1920 PlayRes: font size scales with canvas
    fs = int(s["fontSize"])
    margin_v = int(round((100 - s["position"]) / 100 * 1920 * 0.5))
    primary = hex_to_ass(s["base"], s["opacity"])
    secondary = hex_to_ass(s["accent"])   # karaoke "before highlight" is secondary in \k; we invert below
    outline_col = hex_to_ass(s["outline"])
    active_col = hex_to_ass(s["accent"])
    inactive_col = hex_to_ass(s["base"], s["opacity"])
    outline_w = 4 if s["stroke"] else 0

    effect = s["effect"] if s["effect"] in EFFECTS else "classic"

    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cortex,{font},{fs},{inactive_col},{active_col},{outline_col},&H64000000,{-1 if s["bold"] else 0},0,0,0,100,100,0,0,1,{outline_w},2,5,60,60,{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

    lines = []
    for group in chunk_words(words, max(1, int(s["wordsPerLine"]))):
        if not group:
            continue
        start = group[0]["start"]
        end = group[-1]["end"]
        parts = []
        for w in group:
            text = str(w["word"]).upper() if s["uppercase"] else str(w["word"])
            text = text.replace("{", "(").replace("}", ")").replace("\n", " ")
            dur_cs = max(1, round((w["end"] - w["start"]) * 100))
            active_tags = effect_tags(effect, active_col, s)
            parts.append(
                f"{{\\r{active_tags}}}{{\\k{dur_cs}}}{text}{{\\r}}"
            )
        text_line = " ".join(parts)
        lines.append(
            f"Dialogue: 0,{format_ass_time(start)},{format_ass_time(end)},"
            f"Cortex,,0,0,0,,{{\\fad(60,60)}}{text_line}"
        )
    return header + "\n".join(lines) + "\n"


def effect_tags(effect: str, active_col: str, s: dict[str, Any]) -> str:
    """Override tags applied to the ACTIVE (highlighted) word, per effect.

    With \\k karaoke, the pre-highlight colour is the style's SecondaryColour
    and post-highlight is PrimaryColour; here Primary=inactive(dimmed),
    Secondary=accent. The \\k timing does the classic swap. Extra tags layer
    glow/pop/box on top.
    """
    if effect == "glow":
        return f"\\c{active_col}\\blur2\\bord{4 if s.get('stroke', True) else 2}"
    if effect == "pop":
        return f"\\c{active_col}\\fscx115\\fscy115\\t(0,90,\\fscx100\\fscy100)"
    if effect == "box":
        return f"\\c&H000000&\\3c{active_col}\\bord6"
    if effect == "none":
        return ""
    # classic
    return f"\\c{active_col}"


def build_srt(words: list[dict[str, Any]], words_per_line: int = 3) -> str:
    def fmt(seconds: float) -> str:
        s = max(0.0, seconds)
        h = int(s // 3600)
        m = int((s % 3600) // 60)
        sec = int(s % 60)
        ms = int(round((s - int(s)) * 1000))
        if ms == 1000:
            sec, ms = sec + 1, 0
        return f"{h:02d}:{m:02d}:{sec:02d},{ms:03d}"

    out = []
    for i, group in enumerate(chunk_words(words, words_per_line), 1):
        out.append(f"{i}\n{fmt(group[0]['start'])} --> {fmt(group[-1]['end'])}\n"
                   + " ".join(str(w["word"]) for w in group) + "\n")
    return "\n".join(out)
