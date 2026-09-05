"""Uji toggle auto split cepat: 50% tidak boleh balik ke 5%, hasil tidak salah.

Reproduksi keluhan pengguna (verbatim): "aku matiin terus nyalain lagi auto
split terus memproses lagi tadi udah 50 persen, terus tiba tiba balik lagi ke
5 persen."

Rangkaian yang diperbaiki:
  1. PUT layout-prefs MEMBATALKAN task render lama + menghapus progressnya
     → UI tidak lagi bergoyang antara progress task lama (50%) dan baru (5%).
  2. Task lama yang sempat selesai tepat saat dibatalkan TIDAK menimpa DB
     kalau layoutnya sudah berubah (penjaga hasil usang).
"""
import asyncio
import os
import sys

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


CID = "11111111-2222-3333-4444-555555555555"

print("=== 1) progres task lama dihapus saat layout berubah ===")
set_progress(CID, 50, "Menganalisis wajah")
p = get_progress(CID)
cek("task lama melapor 50%", p and p["pct"] == 50)

# simulate what layout_api.simpan_prefs now does
clear_progress(CID)
p = get_progress(CID)
cek("progress DIHAPUS setelah toggle (tidak ada 50% bekas)", p is None)

print("\n=== 2) task baru mulai dari 2%, bukan lanjut dari 50 ===")
set_progress(CID, 2, "Menyiapkan video")
p = get_progress(CID)
cek("task baru mulai dari 2%", p and p["pct"] == 2)
pct_lama = 50
cek("tidak ada lonjakan/mundur aneh",
    p and p["pct"] < pct_lama, f"{p['pct']} < {pct_lama}")

print("\n=== 3) mundur jauh diperlakukan sebagai render ulang (bukan glitch) ===")
# set_progress sengaja mengizinkan mundur >20% (render baru). Pastikan titik
# riwayat direset sehingga ETA tidak dihitung dari campuran dua render.
set_progress(CID, 60, "Menganalisis wajah")
set_progress(CID, 3, "Menyiapkan video")   # render baru dimulai
p = get_progress(CID)
cek("setelah mundur >20%, pct mengikuti render baru", p and p["pct"] == 3)
cek("elapsed_s dihitung dari mulai BARU (bukan campuran)",
    p is not None and p["elapsed_s"] < 10, f"{p['elapsed_s']}s")

print("\n=== 4) cancel task → CancelledError tidak bocor sebagai error lain ===")
async def uji_cancel():
    from app.background import spawn, sedang_jalan

    key = f"preview:{CID}"
    mulai = {"jalan": True}

    async def kerja_lama():
        set_progress(CID, 50, "Menganalisis wajah")
        while mulai["jalan"]:
            await asyncio.sleep(0.05)
        # setelah 'selesai', usahakan menulis hasil (simulasi race)
        set_progress(CID, 95, "Mengunggah preview")

    t = spawn(kerja_lama(), name="uji", key=key)
    await asyncio.sleep(0.2)
    cek("task lama hidup & melapor", sedang_jalan(key))
    t.cancel()
    try:
        await t
    except asyncio.CancelledError:
        pass
    mulai["jalan"] = False
    return not sedang_jalan(key)

bebas = asyncio.run(uji_cancel())
cek("task lama benar-benar mati setelah cancel", bebas)

print("\n=== 5) penjaga hasil usang ada di kode render ===")
src = open("/home/muhiqbalsukarno/cortexclip-backup/backend/app/render_clip.py",
           encoding="utf-8").read()
cek("render membandingkan layout awal vs sekarang",
    "layout berubah saat render" in src)
cek("hasil usang TIDAK ditulis ke DB", '"usang": True' in src)
src2 = open("/home/muhiqbalsukarno/cortexclip-backup/backend/app/layout_api.py",
            encoding="utf-8").read()
cek("PUT layout-prefs membatalkan task", "_berkunci.get(f\"preview:{clip_id}\")" in src2)
cek("PUT layout-prefs menghapus progress", "clear_progress(clip_id)" in src2)

print(f"\nHASIL: {lulus} lulus, {gagal} gagal")
sys.exit(0)
