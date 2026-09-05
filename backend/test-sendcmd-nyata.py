"""Uji NYATA: ffmpeg harus BERHASIL merender dengan sendcmd + pragelar split.

Regresi yang ditangkap uji ini: build_sendcmd_file() mengembalikan PATH berkas,
bukan isinya. Memanggil .splitlines() pada path menghasilkan berkas sendcmd
berisi satu baris "/tmp/cam_xxx.cmd" → ffmpeg exit 234 → SEMUA preview
face-tracking gagal dan terus mengulang dari 5% tanpa pernah selesai.
Uji ini menjalankan ffmpeg SUNGGUHAN, bukan hanya memeriksa string.
"""
import os
import subprocess
import sys
import tempfile

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


tmp = tempfile.mkdtemp(prefix="uji_sendcmd_")
SRC = os.path.join(tmp, "src.mp4")

print("=== 0) siapkan video uji 1920x1080, 10 detik ===")
subprocess.run(
    ["ffmpeg", "-y", "-v", "error", "-f", "lavfi",
     "-i", "testsrc2=size=1920x1080:rate=30:duration=10",
     "-f", "lavfi", "-i", "sine=frequency=440:duration=10",
     "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
     "-c:a", "aac", "-shortest", SRC],
    check=True)
cek("video uji dibuat", os.path.getsize(SRC) > 10000,
    f"{os.path.getsize(SRC)} B")

print("\n=== 1) build_sendcmd_file mengembalikan PATH, bukan isi ===")
traj = [400.0 + (500.0 if 4.0 <= i / 15.0 <= 6.0 else 0.0) for i in range(150)]
p = build_sendcmd_file(traj, 1920, 1080, out_fps=30.0, analysis_fps=15.0)
cek("nilai kembalian adalah path berkas yang ada", os.path.isfile(p), p)
isi = open(p, encoding="utf-8").read()
cek("isi berkas berisi perintah crop sungguhan", isi.count("crop x") >= 3,
    f"{isi.count('crop x')} perintah")
cek("isi berkas BUKAN sebuah path", not isi.strip().startswith("/tmp/"),
    isi.splitlines()[0][:40])

print("\n=== 2) alur yang dipakai render.py: baca → saring → tulis ulang ===")
splits = [{"start": 6.0, "end": 9.0}]
with open(p, encoding="utf-8") as f:
    lines = f.read().splitlines()
lines = buang_perintah_dekat_split(lines, splits)
with open(p, "w", encoding="utf-8") as f:
    f.write("\n".join(lines) + "\n")
isi2 = open(p, encoding="utf-8").read()
cek("berkas hasil saring masih berisi perintah crop", isi2.count("crop x") > 3,
    f"{isi2.count('crop x')} perintah")

print("\n=== 3) ffmpeg NYATA dengan sendcmd + crop dinamis ===")
out = os.path.join(tmp, "out.mp4")
crop_w = min(int(1080 * (9 / 16)), 1920)
vf = (f"sendcmd=f={p},crop=w={crop_w}:h=1080:x=0:y=0,"
      "scale=360:640:force_original_aspect_ratio=increase,crop=360:640")
r = subprocess.run(
    ["ffmpeg", "-y", "-v", "error", "-i", SRC, "-vf", vf,
     "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
     "-pix_fmt", "yuv420p", "-c:a", "aac", out],
    capture_output=True, text=True)
cek("ffmpeg exit 0 (bukan 234)", r.returncode == 0,
    f"exit {r.returncode}: {r.stderr.strip()[:160]}")
cek("berkas keluaran ada & tidak kosong",
    os.path.exists(out) and os.path.getsize(out) > 5000,
    f"{os.path.getsize(out) if os.path.exists(out) else 0} B")

print("\n=== 4) probe keluaran: 360x640, durasi ~10s ===")
if os.path.exists(out) and os.path.getsize(out) > 5000:
    pr = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height,nb_frames",
         "-of", "csv=p=0", out], capture_output=True, text=True)
    csv = pr.stdout.strip()
    cek("resolusi keluaran 360x640", csv.startswith("360,640"), csv)
    frames = csv.split(",")[2] if len(csv.split(",")) > 2 else "0"
    cek("jumlah frame wajar (>250 untuk 10s @30fps)",
        frames.isdigit() and int(frames) > 250, f"{frames} frame")
else:
    cek("resolusi keluaran 360x640", False, "berkas keluaran tidak ada")
    cek("jumlah frame wajar", False, "berkas keluaran tidak ada")

print("\n=== 5) tanpa split: jalur yang sama tetap berhasil ===")
p2 = build_sendcmd_file(traj, 1920, 1080, out_fps=30.0, analysis_fps=15.0)
with open(p2, encoding="utf-8") as f:
    l2 = f.read().splitlines()
l2 = buang_perintah_dekat_split(l2, [])
with open(p2, "w", encoding="utf-8") as f:
    f.write("\n".join(l2) + "\n")
out2 = os.path.join(tmp, "out2.mp4")
r2 = subprocess.run(
    ["ffmpeg", "-y", "-v", "error", "-i", SRC, "-vf",
     f"sendcmd=f={p2},crop=w={crop_w}:h=1080:x=0:y=0,scale=360:640",
     "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
     "-pix_fmt", "yuv420p", "-an", out2],
    capture_output=True, text=True)
cek("ffmpeg exit 0 tanpa split", r2.returncode == 0,
    f"exit {r2.returncode}: {r2.stderr.strip()[:120]}")

import shutil  # noqa: E402
shutil.rmtree(tmp, ignore_errors=True)
for f in (p, p2):
    try:
        os.unlink(f)
    except OSError:
        pass

print(f"\nHASIL: {lulus} lulus, {gagal} gagal")
sys.exit(0)
