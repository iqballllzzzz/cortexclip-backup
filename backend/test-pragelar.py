"""Uji pragelar split: kamera tidak boleh melompat dekat tepi split.

Keluhan pengguna (verbatim): "kadang-kadang itu suka patah-patah pas detik
detik mau auto split itu suka kamera nya nge track yang salah terus baru
muncul split nya jadi kayak ada pergerakan dulu sebelum muncul split nya".
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app.render import build_sendcmd_file, buang_perintah_dekat_split  # noqa: E402

lulus = gagal = 0


def cek(nama, ok, detail=""):
    global lulus, gagal
    if ok:
        lulus += 1
        print(f"  OK    {nama}" + (f" — {detail}" if detail else ""))
    else:
        gagal += 1
        print(f"  GAGAL {nama} — {detail}")


# trajektori 30 detik, 15 fps analisis: kamera di x=400, lalu 20-22s melompat
# ke x=900 (wajah dominan sebelum split), lalu kembali
traj = []
for i in range(450):
    t = i / 15.0
    if 21.0 <= t <= 22.0:
        traj.append(900.0)
    else:
        traj.append(400.0)

cmd_path = build_sendcmd_file(traj, 1920, 1080, out_fps=30.0, analysis_fps=15.0)
lines = open(cmd_path).read().splitlines()

splits = [{"start": 22.0, "end": 28.0}]
bersih = buang_perintah_dekat_split(lines, splits, pragelar_s=1.6)

def waktu(l):
    return float(l.split(" ", 1)[0])

t_bersih = [waktu(l) for l in bersih]

# 1) tidak ada perintah dalam jendela pragelar [22-1.6, 22] kecuali pembekuan
di_jendela = [t for t in t_bersih if 20.4 <= t < 22.0]
cek("tidak ada perintah kamera di jendela pragelar 1.6s sebelum split",
    not di_jendela, f"{len(di_jendela)} perintah tersisa")

# 2) posisi kamera BEKU di x=400 sampai split dimulai (tidak mengikuti wajah)
posisi_akhir_jendela = [l for l in bersih if waktu(l) <= 20.4]
cek("kamera memegang posisi lama sebelum split",
    bool(posisi_akhir_jendela), f"perintah terakhir t={waktu(posisi_akhir_jendela[-1]):.2f}s")
# crop x = cx - crop_w/2 (crop_w=607). cx=400 → x=96; cx=900 → x=593.
# Beku harus menunjuk posisi LAMA: 96, bukan 593.
cek("posisi beku = kamera lama (x=96, bukan 593 milik wajah dominan)",
    "crop x 96" in posisi_akhir_jendela[-1],
    posisi_akhir_jendela[-1][:60])

# 3) perintah DI DALAM rentang split tidak diubah (filtergraph meng-override)
di_split = [t for t in t_bersih if 22.0 <= t <= 28.0]
asli_di_split = [waktu(l) for l in lines if 22.0 <= waktu(l) <= 28.0]
cek("perintah di dalam rentang split dibiarkan", len(di_split) == len(asli_di_split),
    f"{len(di_split)} vs {len(asli_di_split)}")

# 4) perintah SETELAH jendela pragelar tetap ada
setelah = [t for t in t_bersih if t >= 28.0]
asli_setelah = [waktu(l) for l in lines if waktu(l) >= 28.0]
cek("perintah setelah split tetap ada", len(setelah) == len(asli_setelah))

# 5) tanpa split → tidak ada perubahan
tanpa = buang_perintah_dekat_split(lines, [])
cek("tanpa split: berkas sendcmd tidak berubah", tanpa == lines)

# 6) berkas tetap valid: tiap baris "t crop x N[, rotate a R];"
format_ok = all(
    l.split(" ", 1)[1].startswith("crop x ") or "rotate" in l
    for l in bersih
)
cek("format baris sendcmd tetap valid", format_ok)

# 7) split memulai di 0.0 → jendela sebelum split tidak ada, tidak crash
splits2 = [{"start": 0.0, "end": 5.0}]
bersih2 = buang_perintah_dekat_split(lines, splits2)
cek("split di t=0 tidak memicu crash / menghapus semua", len(bersih2) > 0,
    f"{len(bersih2)} baris")

print(f"\nHASIL: {lulus} lulus, {gagal} gagal")
sys.exit(0)
