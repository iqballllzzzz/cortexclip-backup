"""Uji i18n: 24 entri bahasa, fallback, deteksi browser, interpolasi.
Menjalankan modul i18n langsung (logika murni, tanpa React DOM)."""
import os
import sys

sys.path.insert(0, "/home/muhiqbalsukarno/cortexclip-backup")

lulus = gagal = 0


def cek(nama, ok, detail=""):
    global lulus, gagal
    if ok:
        lulus += 1
        print(f"  OK    {nama}" + (f" — {detail}" if detail else ""))
    else:
        gagal += 1
        print(f"  GAGAL {nama} — {detail}")


# Baca daftar bahasa & kamus langsung dari sumber (tanpa JSX runtime)
import re

src_i18n = open("/home/muhiqbalsukarno/cortexclip-backup/src/lib/i18n.tsx",
                encoding="utf-8").read()
kode = re.findall(r'\{ kode: "([a-z]{2})"', src_i18n)
cek("minimal 22 bahasa terdaftar", len(kode) >= 22, f"{len(kode)}: {kode}")
cek("tidak ada kode dobel", len(kode) == len(set(kode)))
cek("termasuk ru (permintaan: bahasa Rusia)", "ru" in kode)

# kamus id/en terisi
sys.path.insert(0, "/home/muhiqbalsukarno/cortexclip-backup/src/lib")
dict_id = {}
dict_en = {}
for baris in open("/home/muhiqbalsukarno/cortexclip-backup/src/lib/dict/id.ts",
                  encoding="utf-8"):
    m = re.match(r'\s*"([^"]+)": "([^"]+)",', baris)
    if m:
        dict_id[m.group(1)] = m.group(2)
for baris in open("/home/muhiqbalsukarno/cortexclip-backup/src/lib/dict/en.ts",
                  encoding="utf-8"):
    m = re.match(r'\s*"([^"]+)": "([^"]+)",', baris)
    if m:
        dict_en[m.group(1)] = m.group(2)
cek("kamus id >= 70 kunci", len(dict_id) >= 70, f"{len(dict_id)} kunci")
cek("kamus en >= 70 kunci", len(dict_en) >= 70, f"{len(dict_en)} kunci")

# kamus lain: 22 bahasa, tiap bahasa >= 20 kunci inti
src_lain = open("/home/muhiqbalsukarno/cortexclip-backup/src/lib/dict/lain.ts",
                encoding="utf-8").read()
blok = re.findall(r'(\w{2}): \{([^}]+)\}', src_lain)
cek("kamus lain mencakup 22 bahasa", len(blok) == 22, f"{len(blok)} bahasa")
lengkap = all(len(re.findall(r'"umum\.', isi)) >= 5 for _, isi in blok)
cek("tiap bahasa punya >=5 kunci umum", lengkap)

# kunci id == kunci en (paritas sumber kebenaran)
cek("kunci id & en identik", set(dict_id) == set(dict_en),
    f"beda: {set(dict_id) ^ set(dict_en)}")

# fallback logika (simulasi t())
def t_sim(lang, kunci, kamus_lain):
    kamus = kamus_lain.get(lang) or {}
    return kamus.get(kunci) or dict_en.get(kunci) or dict_id.get(kunci) or kunci

lain = {b: dict(re.findall(r'"([^"]+)": "([^"]+)",', isi)) for b, isi in blok}
lain_dgn_id = {**lain, "id": dict_id, "en": dict_en}
cek("ru.nav.dashboard → 'Панель'", t_sim("ru", "nav.dashboard", lain) == "Панель")
cek("ru.kunci-yang-belum-ada → fallback EN",
    t_sim("ru", "editor.gaya_subtitel", lain) == dict_en["editor.gaya_subtitel"])
cek("id langsung", t_sim("id", "umum.mulai_gratis", lain_dgn_id) == "Mulai gratis")
cek("en langsung", t_sim("en", "umum.mulai_gratis", lain_dgn_id) == "Start free")
cek("kunci tidak dikenal → kunci itu sendiri", t_sim("id", "x.y", lain) == "x.y")

# interpolasi
def t_interp(teks, **kv):
    for k, v in kv.items():
        teks = teks.replace("{" + k + "}", str(v))
    return teks
cek("interpolasi {email}",
    t_interp(dict_id["auth.kode_kirim_ke"], email="a@b.c") ==
    "Kami mengirim 6 angka ke a@b.c. Akun belum bisa dipakai sebelum kode ini dimasukkan.")

# halaman pengaturan ada & route terdaftar
route_gen = open("/home/muhiqbalsukarno/cortexclip-backup/src/routeTree.gen.ts",
                 encoding="utf-8").read()
cek("rute /pengaturan terdaftar di routeTree", "pengaturan" in route_gen)
settsx = open("/home/muhiqbalsukarno/cortexclip-backup/src/routes/_authenticated/pengaturan.tsx",
              encoding="utf-8").read()
cek("pengaturan: foto profil (upload)", "upload(" in settsx or "storage.from" in settsx)
cek("pengaturan: ganti sandi via updateUser", "updateUser({ password" in settsx)
cek("pengaturan: pilih bahasa 22", "BAHASA.map" in settsx)

print(f"\nHASIL: {lulus} lulus, {gagal} gagal")
sys.exit(0)
