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
    """Satu offset crop terbaik dari beberapa frame contoh. None kalau gagal.

    Memakai detektor YuNet yang sama dengan jalur penuh: recall-nya 100% vs 85%
    FaceMesh pada podcast uji, dan tanpa itu offset kilat bisa menunjuk wajah yang
    salah pada frame-frame yang FaceMesh lewatkan.
    """
    from . import face_yunet

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

    scale = w / aw
    # kumpulkan posisi wajah (piksel sumber) + luasnya
    titik: list[tuple[float, float]] = []
    for fi in range(n):
        for d in face_yunet.detect(frames[fi], min_face_ratio=0.03):
            titik.append((d["cx"] * scale, d["area"]))

    if not titik:
        print("[quick-track] tidak ada wajah → crop tengah")
        return {"static_x": w / 2.0, "src_w": w, "src_h": h,
                "crop_w": crop_w, "faces": 0, "quick": True}

    xs = np.array([t[0] for t in titik])
    # PILIH JENDELA TERPADAT, bukan pengelompokan berantai.
    # Pengelompokan berantai (v - terakhir <= lim) menyambungkan wajah 775 dan
    # 1295 lewat deteksi-deteksi di antaranya saat sudut kamera sumber berganti,
    # lalu mediannya jatuh di 948 — persis tengah frame, yaitu ruang kosong yang
    # dikeluhkan user. Di sini setiap deteksi dicoba sebagai pusat jendela dan
    # yang mencakup deteksi TERBANYAK yang menang; mediannya diambil hanya dari
    # deteksi di dalam jendela itu.
    lim = crop_w * 0.35
    terbaik: tuple[int, float] = (-1, float(np.median(xs)))
    for c in xs:
        dalam = xs[np.abs(xs - c) <= lim]
        if len(dalam) > terbaik[0]:
            terbaik = (len(dalam), float(np.median(dalam)))
    n_grup = int(np.ceil(len(np.unique(np.round(xs / max(1.0, lim)))) ))
    static_x = terbaik[1]
    # geser supaya jendela tetap di dalam frame
    half = crop_w / 2.0
    static_x = max(half, min(w - half, static_x))
    print(f"[quick-track] {len(titik)} wajah, jendela terpadat {terbaik[0]} "
          f"deteksi → x={static_x:.0f} dari {w}")
    return {"static_x": static_x, "src_w": w, "src_h": h, "crop_w": crop_w,
            "faces": n_grup, "quick": True}
