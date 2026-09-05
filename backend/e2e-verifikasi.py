"""E2E NYATA pendaftaran: kode verifikasi terkirim & login DIBLOKIR sebelum verif.

Dijalankan terhadap produksi (https://cortexclip.eu.cc). Membuat akun uji
sungguhan, lalu:
  1. memastikan signup TIDAK langsung memberi sesi (autoconfirm mati),
  2. memastikan email masuk ke Mailpit dengan pengirim kvcs@cortexclip.eu.cc,
  3. mengambil KODE 6 digit dari isi email,
  4. memastikan login DITOLAK sebelum verifikasi,
  5. memverifikasi dengan kode itu → dapat sesi,
  6. memastikan login BERHASIL setelah verifikasi,
  7. membersihkan akun uji.
"""
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

BASE = "https://cortexclip.eu.cc"
ANON = None
lulus = gagal = 0


def cek(nama, ok, detail=""):
    global lulus, gagal
    if ok:
        lulus += 1
        print(f"  OK    {nama}" + (f" — {detail}" if detail else ""))
    else:
        gagal += 1
        print(f"  GAGAL {nama} — {detail}")


def ambil_anon():
    """Ambil anon key dari .env repo (tidak dicetak)."""
    # Urutan PRIORITAS eksplisit — jangan memindai per baris: .env punya
    # SUPABASE_PUBLISHABLE_KEY (format lain, 199 char) yang ditolak gateway.
    for p, k in (
        ("/home/muhiqbalsukarno/cortexclip-backup/.env",
         "VITE_SUPABASE_PUBLISHABLE_KEY"),
        ("/home/muhiqbalsukarno/cortexclip-backup/backend/.env",
         "SUPABASE_ANON_KEY"),
    ):
        try:
            for line in open(p, encoding="utf-8"):
                if line.startswith(k + "="):
                    return line.split("=", 1)[1].strip().strip('"')
        except OSError:
            continue
    return None


def req(path, data=None, method=None, token=None):
    url = f"{BASE}/auth/v1{path}"
    body = json.dumps(data).encode() if data is not None else None
    r = urllib.request.Request(url, data=body, method=method or ("POST" if data else "GET"))
    r.add_header("apikey", ANON)
    r.add_header("Authorization", f"Bearer {token or ANON}")
    r.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw or "{}")
        except json.JSONDecodeError:
            return e.code, {"raw": raw[:200]}


def mailpit(path, method="GET"):
    """API Mailpit lewat port yang dipublish ke localhost (bukan exec wget:
    BusyBox wget tidak mendukung --method sehingga DELETE tak pernah jalan)."""
    out = subprocess.run(
        ["curl", "-sS", "-X", method, f"http://127.0.0.1:8025/api/v1{path}"],
        capture_output=True, text=True, timeout=40)
    try:
        return json.loads(out.stdout or "{}")
    except json.JSONDecodeError:
        return {"_raw": out.stdout[:200], "_err": out.stderr[:200]}


ANON = ambil_anon()
if not ANON:
    print("GAGAL: anon key tidak ditemukan di .env")
    sys.exit(1)

EMAIL = f"uji-verif-{int(time.time())}@cortexclip-uji.local"
SANDI = "UjiVerif!2026x"

print("=== 0) bersihkan kotak surat uji ===")
mailpit("/messages", method="DELETE")
box = mailpit("/messages?limit=5")
cek("kotak surat kosong", box.get("messages_count", 0) == 0,
    f"{box.get('messages_count')} pesan")

print(f"\n=== 1) daftar akun baru: {EMAIL} ===")
st, sd = req("/signup", {"email": EMAIL, "password": SANDI})
cek("signup HTTP 200", st == 200, f"HTTP {st} {str(sd)[:120]}")
cek("TIDAK langsung dapat access_token (autoconfirm mati)",
    not sd.get("access_token"),
    "ada token!" if sd.get("access_token") else "tidak ada token")
cek("respons menandakan email belum terkonfirmasi",
    sd.get("confirmation_sent_at") is not None or sd.get("email_confirmed_at") is None,
    f"confirmation_sent_at={sd.get('confirmation_sent_at')}")

print("\n=== 2) email masuk & pengirimnya domain custom ===")
pesan = None
for _ in range(20):
    time.sleep(1.5)
    box = mailpit("/messages?limit=10")
    if box.get("messages"):
        pesan = box["messages"][0]
        break
cek("email diterima server surat", pesan is not None,
    f"{box.get('messages_count', 0)} pesan")
if pesan:
    frm = (pesan.get("From") or {})
    alamat = frm.get("Address", "")
    cek("pengirim kvcs@cortexclip.eu.cc", alamat == "kvcs@cortexclip.eu.cc",
        alamat)
    cek("nama pengirim CortexClip", frm.get("Name") == "CortexClip",
        str(frm.get("Name")))
    cek("subjek bahasa Indonesia",
        "Kode verifikasi" in (pesan.get("Subject") or ""),
        pesan.get("Subject"))
    tujuan = [t.get("Address") for t in (pesan.get("To") or [])]
    cek("dikirim ke alamat pendaftar", EMAIL in tujuan, str(tujuan))
else:
    for n in ("pengirim kvcs@cortexclip.eu.cc", "nama pengirim CortexClip",
              "subjek bahasa Indonesia", "dikirim ke alamat pendaftar"):
        cek(n, False, "tidak ada email")

print("\n=== 3) ambil KODE 6 digit dari isi email ===")
kode = None
if pesan:
    isi = mailpit(f"/message/{pesan['ID']}")
    teks = (isi.get("Text") or "") + " " + (isi.get("HTML") or "")
    cek("template custom dipakai (ada kata 'Kode verifikasi')",
        "Kode verifikasi" in teks or "KODE VERIFIKASI" in teks.upper())
    m = re.search(r"\b(\d{6})\b", teks)
    kode = m.group(1) if m else None
    cek("kode 6 digit ditemukan", kode is not None, str(kode))
    cek("email menyebut nama produk", "CortexClip" in teks)
else:
    for n in ("template custom dipakai (ada kata 'Kode verifikasi')",
              "kode 6 digit ditemukan", "email menyebut nama produk"):
        cek(n, False, "tidak ada email")

print("\n=== 4) LOGIN HARUS DITOLAK sebelum verifikasi ===")
st, sd = req("/token?grant_type=password", {"email": EMAIL, "password": SANDI})
cek("login ditolak (HTTP 4xx)", 400 <= st < 500, f"HTTP {st}")
cek("alasan penolakan = email belum dikonfirmasi",
    "not confirmed" in json.dumps(sd).lower()
    or "email_not_confirmed" in json.dumps(sd).lower(),
    str(sd)[:140])
cek("tidak ada access_token yang lolos", not sd.get("access_token"))

print("\n=== 5) verifikasi dengan kode → dapat sesi ===")
if kode:
    st, sd = req("/verify", {"type": "signup", "email": EMAIL, "token": kode})
    cek("verify HTTP 200", st == 200, f"HTTP {st} {str(sd)[:140]}")
    cek("dapat access_token setelah verifikasi",
        bool(sd.get("access_token")), "ada" if sd.get("access_token") else "tidak ada")
    u = sd.get("user") or {}
    cek("email_confirmed_at terisi", bool(u.get("email_confirmed_at")),
        str(u.get("email_confirmed_at"))[:30])
else:
    for n in ("verify HTTP 200", "dapat access_token setelah verifikasi",
              "email_confirmed_at terisi"):
        cek(n, False, "kode tidak ada")

print("\n=== 6) login BERHASIL setelah verifikasi ===")
st, sd = req("/token?grant_type=password", {"email": EMAIL, "password": SANDI})
cek("login HTTP 200", st == 200, f"HTTP {st} {str(sd)[:120]}")
cek("dapat access_token", bool(sd.get("access_token")))

print("\n=== 7) kode salah harus DITOLAK ===")
EMAIL2 = f"uji-verif-b-{int(time.time())}@cortexclip-uji.local"
st, _ = req("/signup", {"email": EMAIL2, "password": SANDI})
st2, sd2 = req("/verify", {"type": "signup", "email": EMAIL2, "token": "000000"})
cek("kode ngawur ditolak", st2 >= 400, f"HTTP {st2}")
st3, sd3 = req("/token?grant_type=password",
               {"email": EMAIL2, "password": SANDI})
cek("akun kedua tetap tidak bisa login", st3 >= 400, f"HTTP {st3}")

print("\n=== 8) bersihkan akun uji ===")
sql = (f"DELETE FROM auth.users WHERE email IN ('{EMAIL}', '{EMAIL2}');")
out = subprocess.run(
    ["sg", "docker", "-c",
     f'docker exec -i supabase-db psql -U supabase_admin -d postgres -c "{sql}"'],
    capture_output=True, text=True, timeout=60)
cek("akun uji dihapus", "DELETE" in out.stdout, out.stdout.strip()[:60])

print(f"\nHASIL: {lulus} lulus, {gagal} gagal")
sys.exit(0)
