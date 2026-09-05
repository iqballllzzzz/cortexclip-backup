"""Watermark CortexClipAI — logo + nama samping + tagline, putih 65% opacity.

Layout (spesifikasi user):
  [LOGO] CortexClipAI
         AI that can help many people, made in Indonesia

- Warna putih/abu transparan (alpha 65%)
- Ukuran sedang, posisi kiri-atas — agak ke bawah & ke kanan dari pojok
  (space biar terbaca tapi tidak mengganggu penonton)
- Dibuat sebagai PNG RGBA komposit → dibakar ffmpeg overlay sekali per frame
  (overlay filter + enable antara t_start..t_end — untuk mode hapus watermark)
"""
from __future__ import annotations

import os
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

LOGO_PATH = Path(__file__).parent.parent / "assets" / "cortexclip-logo-white.png"
FONT_DIR = "/usr/share/fonts/truetype/subtitles"

WATERMARK_OPACITY = 0.65  # 65% — spesifikasi user


def build_watermark_png(
    out_path: str | None = None,
    target_width: int = 1080,
    opacity: float = WATERMARK_OPACITY,
) -> str:
    """Bangun PNG watermark komposit, skala proporsional ke lebar video.

    target_width: lebar video output (1080 utk 9:16 final, 360 utk preview).
    """
    if out_path is None:
        fd, out_path = tempfile.mkstemp(suffix=".png", prefix="wm_")
        os.close(fd)

    # skala: watermark menempati ~30% lebar video (logo+teks), tidak mengganggu
    block_w = int(target_width * 0.30)
    logo_size = int(block_w * 0.32)
    gap = int(logo_size * 0.28)
    pad = int(logo_size * 0.10)

    # --- logo ---
    logo = Image.open(LOGO_PATH).convert("RGBA").resize(
        (logo_size, logo_size), Image.LANCZOS
    )

    # --- font ukuran relatif ---
    name_size = max(14, int(logo_size * 0.34))
    tag_size = max(9, int(logo_size * 0.155))
    name_font = None
    tag_font = None
    for cand in ["THEBOLDFONT.ttf", "TikTokSans-Regular.ttf", "Anton-Regular.ttf"]:
        p = os.path.join(FONT_DIR, cand)
        if os.path.exists(p):
            name_font = ImageFont.truetype(p, name_size)
            tag_font = ImageFont.truetype(p, tag_size)
            break
    if name_font is None:
        name_font = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", name_size
        )
        tag_font = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", tag_size
        )

    name_text = "CortexClipAI"
    tag_text = "AI that can help many people, made in Indonesia"

    # --- ukur teks ---
    tmp = ImageDraw.Draw(Image.new("RGBA", (8, 8)))
    name_bbox = tmp.textbbox((0, 0), name_text, font=name_font)
    name_w = name_bbox[2] - name_bbox[0]
    name_h = name_bbox[3] - name_bbox[1]
    tag_bbox = tmp.textbbox((0, 0), tag_text, font=tag_font)
    tag_w = tag_bbox[2] - tag_bbox[0]
    tag_h = tag_bbox[3] - tag_bbox[1]

    text_block_w = max(name_w, tag_w)
    text_block_h = name_h + int(name_h * 0.38) + tag_h

    total_w = pad + logo_size + gap + text_block_w + pad
    total_h = max(logo_size, text_block_h) + pad * 2
    total_w = int(total_w)
    total_h = int(total_h)

    img = Image.new("RGBA", (total_w, total_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # logo: opacity dikali alpha ASLI logo (jangan menimpa — kalau putalpha
    # konstan, area transparan logo ikut terlihat → watermark jadi kotak)
    alpha = int(255 * opacity)
    logo_a = logo.copy()
    r_, g_, b_, a_ = logo_a.split()
    a_scaled = a_.point(lambda v: (v * alpha) // 255)
    logo_a.putalpha(a_scaled)
    img.paste(logo_a, (pad, (total_h - logo_size) // 2), logo_a)

    # teks putih alpha
    white = (255, 255, 255, alpha)
    tx = pad + logo_size + gap
    ty = (total_h - text_block_h) // 2
    draw.text((tx, int(ty)), name_text, font=name_font, fill=white)
    draw.text((tx, int(ty + name_h + name_h * 0.38)), tag_text, font=tag_font, fill=white)

    img.save(out_path)
    return out_path


def ffmpeg_overlay_args(
    video_width: int,
    video_height: int,
    wm_path: str,
) -> tuple[str, str]:
    """Posisi overlay ffmpeg: kiri-atas, offset ke bawah+kanan dari pojok.

    Return (position_args, watermark_input) untuk disisip ke ffmpeg cmd:
      - watermark_input: ["-i", wm_path] sebelum output
      - filter: [1:v]scale=...[wm];[0:v][wm]overlay=x:y
    """
    # offset dari pojok: dulu 5,5% lebar. Pengguna minta digeser ke kiri
    # ("watermarknya terlalu ke kanan, ke kiri dikit saja") → 3,0%.
    # Tetap di dalam safe-area TikTok/Reels (elemen UI mulai ~2% dari tepi),
    # jadi tidak terpotong di aplikasi mana pun.
    x = int(video_width * 0.030)
    y = int(video_height * 0.045)
    scale_w = int(video_width * 0.30)  # block lebar watermark 30% video
    vf = (
        f"[1:v]scale={scale_w}:-1[wm];"
        f"[0:v][wm]overlay={x}:{y}:format=auto"
    )
    return vf, wm_path
