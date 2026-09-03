"""Jalur kamera CEPAT untuk preview instan di browser.

MASALAH: analisis face tracking penuh (15 fps, FaceMesh per frame) butuh ~40
detik untuk klip 60 detik. Editor tidak bisa menunggu itu — user melihat video
sumber ter-crop di TENGAH sampai render server selesai, dan pada podcast dua
orang bagian tengah justru ruang kosong di antara mereka.

SOLUSI: dua tingkat.
  1. quick_track()  — ambil ~14 frame tersebar lewat HTTP range, cari wajah,
     hitung SATU offset x terbaik. Selesai 2-4 detik. Editor langsung memakainya
     sebagai transform CSS, jadi bingkai benar SEJAK DETIK PERTAMA.
  2. analisis penuh tetap jalan di belakang dan menimpa hasilnya (x[] per frame
     + cuts), dipakai render dan diambil editor begitu tersedia.

Offset dipilih dengan menimbang JUMLAH FRAME wajah itu terlihat: pada dua orang
berdempetan, orang yang lebih sering ada di frame lebih layak jadi pusat. Kalau
dua wajah terpisah lebih lebar dari jendela crop, pilih yang paling sering
terlihat — JANGAN titik tengah keduanya (itu tepat bug yang dilaporkan user).
"""
from __future__ import annotations

from typing import Any, Optional

import numpy as np

QUICK_SAMPLES = 14        # jumlah frame yang diperiksa
QUICK_WIDTH = 480         # lebar analisis (kecil = cepat)


def quick_track(src: str, start: float, end: float, *, probe_size, run_ffmpeg,
                aspect: float = 9 / 16) -> Optional[dict[str, Any]]:
    """Satu offset crop terbaik dari beberapa frame contoh. None kalau gagal."""
    from .speaker_detect import get_mesh
    from .speaker_track import MIN_FACE_RATIO, face_from_landmarks

    try:
        w, h = probe_size(src)
    except Exception as exc:
        print(f"[quick-track] probe gagal: {exc}")
        return None
    dur = max(0.0, end - start)
    if dur < 0.5 or w <= 0:
        return None

    crop_w = min(int(h * aspect), w)
    ah = max(180, int(QUICK_WIDTH * h / w / 2) * 2)
    aw = int(ah * w / h / 2) * 2
    # HANYA KEYFRAME (-skip_frame nokey): filter fps memaksa ffmpeg mendekode
    # SELURUH rentang lalu membuang hampir semuanya — terukur 23 detik untuk klip
    # 61 detik dari storage HTTP. Keyframe saja memberi ~15-30 frame tersebar
    # merata dengan biaya dekode sebagian kecil.
    try:
        raw = run_ffmpeg(["ffmpeg", "-v", "error",
                          "-skip_frame", "nokey",
                          "-ss", f"{start:.3f}", "-t", f"{dur:.3f}", "-i", src,
                          "-vf", f"scale={aw}:{ah}", "-vsync", "0",
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                         timeout=120).stdout
    except Exception as exc:
        print(f"[quick-track] decode gagal: {str(exc)[:140]}")
        return None

    fb = aw * ah * 3
    n = len(raw) // fb
    if n < 1:
        print(f"[quick-track] frame terlalu sedikit ({n})")
        return None
    frames = np.frombuffer(raw[: n * fb], dtype=np.uint8).reshape(n, ah, aw, 3)
    # kalau keyframe-nya banyak, ambil paling banyak QUICK_SAMPLES yang tersebar
    if n > QUICK_SAMPLES:
        idx = np.linspace(0, n - 1, QUICK_SAMPLES).astype(int)
        frames = frames[idx]
        n = len(frames)

    mesh = get_mesh()
    scale = w / aw
    # kumpulkan posisi wajah (piksel sumber) + luasnya
    titik: list[tuple[float, float]] = []
    for fi in range(n):
        try:
            res = mesh.process(np.ascontiguousarray(frames[fi]))
        except Exception:
            continue
        for lm in (res.multi_face_landmarks or []):
            d = face_from_landmarks(lm.landmark, aw, ah)
            if d["fw"] / aw < MIN_FACE_RATIO:
                continue
            titik.append((d["cx"] * scale, d["area"]))

    if not titik:
        print("[quick-track] tidak ada wajah → crop tengah")
        return {"static_x": w / 2.0, "src_w": w, "src_h": h,
                "crop_w": crop_w, "faces": 0, "quick": True}

    xs = np.array([t[0] for t in titik])
    # KELOMPOKKAN wajah yang berdekatan (orang yang sama sepanjang klip).
    # Ambang setengah lebar crop: dua orang yang lebih dekat dari itu tetap muat
    # dalam satu jendela, jadi tidak perlu dipisah.
    order = np.argsort(xs)
    xs_sorted = xs[order]
    lim = crop_w * 0.5
    groups: list[list[float]] = [[float(xs_sorted[0])]]
    for v in xs_sorted[1:]:
        if v - groups[-1][-1] <= lim:
            groups[-1].append(float(v))
        else:
            groups.append([float(v)])

    # kelompok terbanyak = orang yang paling sering terlihat
    best = max(groups, key=len)
    static_x = float(np.median(best))
    # geser supaya jendela tetap di dalam frame
    half = crop_w / 2.0
    static_x = max(half, min(w - half, static_x))
    print(f"[quick-track] {len(titik)} wajah, {len(groups)} kelompok "
          f"(terbanyak {len(best)}) → x={static_x:.0f} dari {w}")
    return {"static_x": static_x, "src_w": w, "src_h": h, "crop_w": crop_w,
            "faces": len(groups), "quick": True}
