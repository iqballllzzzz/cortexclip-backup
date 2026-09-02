"""Speaker tracking canggih: sorot wajah yang BENAR-BENAR sedang bicara.

Dipakai untuk klip vertikal dari video landscape (podcast, wawancara, panel).
Menangani banyak orang sekaligus, termasuk dua orang yang duduk berdempetan.

CARA KERJANYA

MediaPipe FaceMesh memberi 468 landmark per wajah, hingga 10 wajah sekaligus.
Dari landmark itu diambil dua hal: posisi/ukuran wajah, dan BUKAAN MULUT
(jarak bibir dalam atas-bawah dibagi tinggi wajah, jadi bebas skala). Orang yang
bicara punya bukaan mulut yang naik-turun terus; orang yang diam hampir rata.
Skor bicara = simpangan baku bukaan mulut dalam jendela 1 detik.

KENAPA BUKAN CARA LAIN (sudah diukur, gagal)

- BlazeFace (deteksi kotak wajah) + selisih piksel potongan mulut: rasio
  simpangan pita mulut terhadap pita dahi tetap ~1.0 bahkan untuk wajah yang
  jelas bicara, karena gerak kepala mendominasi kedua pita secara sama. Skornya
  jadi acak dan kamera memilih orang yang salah.
- BlazeFace juga sering hanya menemukan 1-2 dari 3 wajah pada frame lebar
  (masukan model dikecilkan ke ~256px), sehingga pembicaranya kadang tidak ada
  dalam daftar kandidat sama sekali.

Dengan landmark bibir, pengukuran pada video uji 3 orang memberi pemisahan
sekitar 10x: wajah yang bicara ~0.023, yang diam ~0.002.

MASALAH LAIN YANG IKUT DIPERBAIKI

- Dua wajah berdempetan dianggap satu orang: ambang pencocokan identitas dulu
  memakai lebar FRAME; sekarang relatif LEBAR WAJAH dengan asosiasi
  global-greedy (pasangan terdekat dipasangkan lebih dulu).
- Kamera menyorot ruang kosong di antara dua orang: setiap pergantian orang
  aktif WAJIB menjadi potongan, dan penghalusan dilakukan per segmen antar
  potongan, jadi kurva kamera tidak pernah melintas dari wajah A ke wajah B
  melewati titik tengah.
- Klip dengan banyak orang: wajah kecil di latar tidak dianggap kandidat, dan
  kalau tidak ada yang bicara kamera BERTAHAN pada orang terakhir (bukan
  melompat ke wajah terbesar).
"""
from __future__ import annotations

from typing import Any

# ---- landmark FaceMesh yang dipakai ----------------------------------------
LIP_TOP, LIP_BOT = 13, 14        # bibir dalam atas & bawah
MOUTH_L, MOUTH_R = 78, 308       # sudut mulut
FACE_TOP, FACE_CHIN = 10, 152    # dahi atas & dagu
FACE_L, FACE_R = 234, 454        # pipi kiri & kanan

# ---- parameter (relatif, jadi tidak tergantung resolusi) -------------------
MAX_FACES = 10            # podcast panel: dukung sampai 10 wajah
MIN_FACE_RATIO = 0.030    # wajah < 3% lebar frame = latar, bukan kandidat
MATCH_FACE_RATIO = 0.85   # jarak maks pencocokan identitas = 0.85 x lebar wajah

SAMPLE_FPS = 15           # bicara 3-4 suku kata/detik; 5 fps teraliasing
WIN_FRAMES = 9            # jendela penilaian 0.6 detik, diukur dalam WAKTU
MIN_SAMPLES = 4           # di bawah ini belum bisa dinilai

# penemuan + penyempurnaan per-ROI (lihat docstring speaker_detect.py):
# FaceMesh frame penuh kehilangan wajah 15-30% frame pada podcast 3 orang, dan
# jendela penilaian 1 detik jadi bolong. ROI di sekitar posisi terakhir tiap
# track membuat wajah mengisi hampir seluruh potongan → landmark presisi dan
# wajah praktis tidak pernah hilang.
DISCOVER_EVERY = 1        # cari wajah pada frame penuh SETIAP frame (~8ms)
ROI_SCALE = 1.30          # setengah-lebar ROI = 1.3 x lebar wajah
ROI_RETRY = 2.10          # kalau gagal, coba sekali lagi dengan ROI lebih lebar
MAX_DRIFT = 0.80          # hasil ROI ditolak kalau bergeser > 0.8 x lebar wajah
MERGE_RATIO = 0.45        # dua track < 0.45 x lebar wajah = wajah sama, digabung
RECENT_FRAMES = 8         # kandidat tetap dihitung kalau terlihat < 8 frame lalu

SPEAK_ON = 0.0060         # simpangan bukaan mulut untuk dianggap bicara
SPEAK_OFF = 0.0035        # di bawah ini dianggap berhenti bicara
DOMINANCE = 1.60          # kandidat harus 60% lebih "bicara" dari yang aktif
CUT_MIN_SAMPLES = 6       # kandidat baru boleh memicu potong kalau datanya cukup
EMA_UP = 0.85             # skor naik cepat (pindah pembicara harus responsif)
EMA_DOWN = 0.30           # turun lambat (jeda antar kata bukan berhenti)

HOLD_FRAMES = 2           # kandidat harus dominan 2 frame (0.13s @15fps)
COOLDOWN_S = 0.8          # jeda minimal antar potong kamera
STICKY_S = 0.5            # setelah pindah, kandidat lain ditahan dulu
LOST_S = 3.0              # track hilang lebih lama dari ini -> dipensiunkan
RETIRE_S = 8.0            # identitas pensiun masih bisa dipakai ulang
SCENE_CUT_DIFF = 22.0     # ambang potongan adegan (beda rata-rata piksel)


def face_from_landmarks(lm, w: int, h: int) -> dict[str, float]:
    """Posisi, ukuran, dan bukaan mulut satu wajah dari landmark FaceMesh."""
    fh = abs(lm[FACE_CHIN].y - lm[FACE_TOP].y) * h
    fw = abs(lm[FACE_R].x - lm[FACE_L].x) * w
    cx = (lm[MOUTH_L].x + lm[MOUTH_R].x) / 2 * w
    cy = (lm[FACE_TOP].y + lm[FACE_CHIN].y) / 2 * h
    ap = abs(lm[LIP_BOT].y - lm[LIP_TOP].y) * h / fh if fh > 1e-6 else 0.0
    return {"cx": cx, "cy": cy, "fw": fw, "fh": fh, "aperture": ap,
            "area": (fw * fh) / (w * h)}


def assign(dets: list[dict[str, Any]], tracks: list[dict[str, Any]],
           ) -> dict[int, int]:
    """Asosiasi global-greedy deteksi->track. Balik {index_det: index_track}.

    Pasangan dengan jarak terkecil dipasangkan lebih dulu, sehingga dua wajah
    berdampingan tidak saling tukar identitas seperti pada pencocokan berurutan.
    """
    pairs: list[tuple[float, int, int]] = []
    for di, d in enumerate(dets):
        limit = max(6.0, d["fw"] * MATCH_FACE_RATIO)
        for ti, t in enumerate(tracks):
            dist = abs(t["cx"] - d["cx"]) + abs(t["cy"] - d["cy"]) * 0.6
            if dist <= limit:
                pairs.append((dist, di, ti))
    pairs.sort()
    out: dict[int, int] = {}
    used: set[int] = set()
    for _, di, ti in pairs:
        if di in out or ti in used:
            continue
        out[di] = ti
        used.add(ti)
    return out
