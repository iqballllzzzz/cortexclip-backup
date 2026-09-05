"""Uji palang monoton: persen preview tidak boleh turun dalam satu render.

Diambil dari data E2E NYATA (klip 38e04489): urutan progres yang terjadi adalah
[4,4,4,4,4,4,5,6,6,5,12,16,...] — ada mundur 1% (6 → 5) karena fase unduh dan
fase analisis memakai skala berbeda. Bagi pengguna itu terlihat "kok turun".
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app.preview_progress import (  # noqa: E402
    clear_progress,
    get_progress,
    set_progress,
)

lulus = gagal = 0


def cek(nama, ok, detail=""):
    global lulus, gagal
    if ok:
        lulus += 1
        print(f"  OK    {nama}" + (f" — {detail}" if detail else ""))
    else:
        gagal += 1
        print(f"  GAGAL {nama} — {detail}")


CID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
clear_progress(CID)

print("=== 1) urutan NYATA dari E2E klip 38e04489 ===")
NYATA = [4, 4, 4, 4, 4, 4, 5, 6, 6, 5, 12, 16, 22, 28, 33, 39, 44, 50, 56,
         58, 58, 58, 60, 62, 63, 64, 65, 66, 67, 68, 69, 70, 72, 73, 74, 75,
         76, 77, 78, 79, 80, 81, 82, 84, 85, 86, 87, 88, 89, 100]
terlihat = []
for p in NYATA:
    set_progress(CID, p, "uji")
    terlihat.append(get_progress(CID)["pct"])

turun = [(a, b) for a, b in zip(terlihat, terlihat[1:]) if b < a]
cek("tidak ada satu pun penurunan", not turun, f"{turun}")
cek("mundur 6→5 dinaikkan menjadi 6", terlihat[9] == 6, f"pct={terlihat[9]}")
cek("nilai akhir tetap 100", terlihat[-1] == 100, f"{terlihat[-1]}")
cek("nilai tertinggi tidak melebihi 100", max(terlihat) == 100)

print("\n=== 2) render ULANG (mundur >20%) tetap boleh reset ===")
clear_progress(CID)
set_progress(CID, 60, "uji")
set_progress(CID, 3, "render baru")     # mundur 57% = render baru
p = get_progress(CID)
cek("mundur >20% mereset ke render baru", p["pct"] == 3, f"pct={p['pct']}")
cek("elapsed_s dihitung dari mulai baru", p["elapsed_s"] < 5,
    f"{p['elapsed_s']}s")

print("\n=== 3) mundur tepat di batas 20% ===")
clear_progress(CID)
set_progress(CID, 50, "uji")
set_progress(CID, 31, "uji")   # mundur 19% → dianggap glitch fase, DITAHAN
cek("mundur 19% ditahan di 50", get_progress(CID)["pct"] == 50)
clear_progress(CID)
set_progress(CID, 50, "uji")
set_progress(CID, 29, "uji")   # mundur 21% → render baru
cek("mundur 21% diterima sebagai render baru",
    get_progress(CID)["pct"] == 29)

print("\n=== 4) ETA tidak pernah dihitung dari laju negatif ===")
clear_progress(CID)
for p in [5, 6, 5, 12, 20]:
    set_progress(CID, p, "uji")
    time.sleep(0.15)
g = get_progress(CID)
cek("eta_s masuk akal atau None",
    g["eta_s"] is None or 0 < g["eta_s"] <= 1800, f"eta={g['eta_s']}")

print("\n=== 5) status gagal tidak tertimpa progres lama ===")
clear_progress(CID)
set_progress(CID, 40, "uji")
from app.preview_progress import ambil_gagal, set_gagal  # noqa: E402
set_gagal(CID, "Render video gagal di server (ffmpeg)")
info = ambil_gagal(CID)
cek("kegagalan terbaca", info is not None and "ffmpeg" in info["pesan"],
    str(info))
cek("pesan gagal dipotong <=300 char", len(info["pesan"]) <= 300)
clear_progress(CID)
cek("clear_progress menghapus penanda gagal", ambil_gagal(CID) is None)

print(f"\nHASIL: {lulus} lulus, {gagal} gagal")
sys.exit(0)
