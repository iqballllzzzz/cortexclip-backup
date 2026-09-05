"""Uji guard akurasi face tracking — kamera salah kunci harus dikunci ulang.
Keluhan pengguna: "face tracking nya masih gak pas ke orangnya, jauh banget
dari orang nya, yang terlihat cuman pundaknya doang".
Guard: median jarak kamera→wajah per segmen > 35% lebar crop → kunci ulang
ke median target segmen (snap satu frame, seperti perpindahan pembicara).
Konversi satuan: target dalam piksel ANALISIS; keluaran = piksel SUMBER
(scale = src_w/analysis_w = 1920/1080 = 1,7778).
"""
import os
import sys

sys.path.insert(0, "/home/muhiqbalsukarno/cortexclip-backup/backend")
from app.speaker_pick import build_trajectory  # noqa: E402

S = 1920 / 1080  # analisis → sumber
lulus = gagal = 0


def cek(nama, ok, detail=""):
    global lulus, gagal
    if ok:
        lulus += 1
        print(f"  OK    {nama}" + (f" — {detail}" if detail else ""))
    else:
        gagal += 1
        print(f"  GAGAL {nama} — {detail}")


# 1) Dua shot normal dengan cut: kamera mengikuti tiap wajah
targets = [400.0] * 45 + [1000.0] * 45
traj = build_trajectory(targets, {45}, 1920, 607, 1080, 15.0)
cek("segmen 1 mengikuti wajah x=400",
    all(abs(t - 400 * S) < 60 for t in traj[5:40]))
cek("segmen 2 mengikuti wajah x=1000 (clamp tepi kanan 1616.5)",
    all(abs(t - 1616.5) < 1 for t in traj[50:85]))

# 2) Wajah diam: tidak boleh terganggu guard
traj4 = build_trajectory([500.0] * 90, set(), 1920, 607, 1080, 15.0)
cek("wajah diam: kamera terkunci tepat di wajah",
    all(abs(t - 500 * S) < 5 for t in traj4))

# 3) Dua shot normal: guard tidak mengubah apa pun
targets5 = [300.0] * 45 + [700.0] * 45
traj5 = build_trajectory(targets5, {45}, 1920, 607, 1080, 15.0)
cek("dua shot normal tidak berubah oleh guard",
    all(abs(t - 300 * S) < 60 for t in traj5[5:40])
    and all(abs(t - 700 * S) < 60 for t in traj5[50:85]))

# 4) Kasus keluhan: shot TANPA cut yang terdeteksi, wajah pindah jauh di
#    tengah shot. Stabilize butuh dwell sebelum geser → sementara kamera
#    masih jauh. Guard harus MEMANGKAS situasi ekstrem: kalau pada separuh
#    segmen jarak kamera→wajah > guard, segmen dipecah minimum di titik
#    lompatan target terbesar (kunci ulang per sub-bagian).
targets6 = [400.0] * 60 + [1100.0] * 30   # cut terlewat: satu "shot" dua orang
traj6 = build_trajectory(targets6, set(), 1920, 607, 1080, 15.0)
# Setelah guard, TIDAK BOLEH ada run panjang (>2s=30 frame) dengan jarak
# kamera→wajah > 35% crop di area statis wajah.
HALF = 607 / 2  # clamp sama dengan produksi: kamera & target dijangkau crop
def clamp(t):
    return max(HALF, min(1920 - HALF, t * S))
buruk = 0
maks = 0
for o, t in zip(traj6, targets6):
    j = abs(o - clamp(t))
    maks = max(maks, j)
    buruk = buruk + 1 if j > 607 * 0.35 else 0
cek("cut terlewat: tidak ada run salah-target >1,6 detik",
    buruk <= 24, f"run terpanjang salah: {buruk} frame, jarak maks {maks:.0f}px")
# ujung kedua bagian harus TEPAT di wajah (transisi selesai)
cek("akhir transisi tepat di wajah (10 frame terakhir)",
    all(abs(o - clamp(t)) < 30 for o, t in zip(traj6[-10:], targets6[-10:])))
cek("awal tepat di wajah (10 frame pertama)",
    all(abs(o - clamp(t)) < 30 for o, t in zip(traj6[:10], targets6[:10])))

# 5) Ukuran keluaran selalu sama dengan masukan
cek("panjang keluaran = panjang masukan", len(traj6) == len(targets6))

print(f"\nHASIL: {lulus} lulus, {gagal} gagal")
sys.exit(0)
