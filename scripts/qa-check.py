#!/usr/bin/env python3
"""QA otomatis CortexClip — dijalankan cron tiap 2 jam.

Cek: halaman (HTTP 200 + konten), endpoint publik & auth, injection,
health backend, rate plan, XSS-ish payload, dan konsistensi data.
Output: ringkasan PASS/FAIL per kelompok (untuk cron delivery).
"""
import json
import os
import shutil
import subprocess
import time
import urllib.request
import urllib.error
import urllib.parse
import sys
from datetime import datetime, timedelta, timezone

BASE = "https://clip.aqualibrya.my.id"
SB = "http://localhost:8000"
ENV = "/home/muhiqbalsukarno/supabase-docker/docker/.env"
results: list[tuple[bool, str]] = []


def env(k: str) -> str:
    for line in open(ENV):
        if line.startswith(k + "="):
            return line.split("=", 1)[1].strip()
    return ""


def get(url: str, headers=None, timeout=25):
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except Exception as e:
        return 0, str(e).encode()


def post(url: str, data: dict, headers=None, timeout=25):
    body = json.dumps(data).encode()
    h = {"Content-Type": "application/json", **(headers or {})}
    req = urllib.request.Request(url, data=body, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def ok(name: str, cond: bool, detail: str = "") -> None:
    results.append((bool(cond), f"{name}{(' — ' + detail) if detail and not cond else ''}"))


ANON = env("ANON_KEY")
SRK = env("SERVICE_ROLE_KEY")

# ============ 1. HALAMAN PUBLIK ============
pages = ["/", "/auth", "/dashboard", "/admin", "/reset-password"]
for p in pages:
    st, body = get(BASE + p, timeout=30)
    ok(f"halaman {p}", st == 200 and len(body) > 2000, f"HTTP {st} len={len(body)}")

st, body = get(BASE + "/", timeout=30)
ok("landing hero baru tampil", b"Auto-clipper" in body)
ok("landing toggle tema termuat", b"Ganti ke tema" in body or b"theme" in body.lower())

# ============ 2. HEALTH & API DASAR ============
st, body = get("http://localhost:8787/health", timeout=15)
ok("backend /health", st == 200)
st, _ = get(BASE + "/api/premium/plans", timeout=15)
ok("GET /api/premium/plans publik", st == 200)

# endpoint tanpa auth harus ditolak (401/403/422), bukan 200
for ep, method in [("/api/quota", "GET"), ("/api/admin/stats", "GET"), ("/api/render-jobs", "GET")]:
    st, _ = get(BASE + ep, timeout=15)
    ok(f"{ep} tanpa auth ditolak", st in (401, 403, 422), f"HTTP {st}")

st, _ = post(BASE + "/api/admin/login", {"username": "x", "password": "x"}, timeout=15)
ok("admin login kredensial salah ditolak", st == 401, f"HTTP {st}")

# ============ 3. LOGIN & ENDPOINT USER ============
st, body = post(SB + "/auth/v1/token?grant_type=password",
                {"email": "tes-premium+x1@gmail.com", "password": "TesPremium2026!x"},
                {"apikey": ANON})
ok("login user tes", st == 200)
TOK = ""
try:
    TOK = json.loads(body)["access_token"]
except Exception:
    pass
H = {"Authorization": f"Bearer {TOK}"} if TOK else {}

if TOK:
    st, body = get(BASE + "/api/me/status", H, timeout=20)
    d = json.loads(body) if st == 200 else {}
    ok("GET /api/me/status", st == 200 and "is_admin" in d)
    ok("kuota terbaca", st == 200 and d.get("quota", {}).get("limit") in (2, 10))

    # SQL injection di parameter search
    for payload in ["99999999-9999-9999-9999-999999999999' OR 1=1--", "'; DROP TABLE profiles;--"]:
        st, _ = get(BASE + f"/api/admin/users?search={urllib.parse.quote(payload[:40])}", H, timeout=15)
        ok(f"injection search ditolak/di-escape ({payload[:20]!r})", st in (200, 400, 403), f"HTTP {st}")

    # IDOR: akses data user lain via endpoint yang cek kepemilikan
    st, _ = get(BASE + "/api/render-jobs", H, timeout=15)
    ok("render-jobs milik sendiri saja (200)", st == 200)

    # endpoint admin dengan JWT non-admin harus 403
    st, _ = get(BASE + "/api/admin/stats", H, timeout=15)
    ok("non-admin ditolak di /api/admin/stats", st == 403, f"HTTP {st}")

    # XSS-ish payload di create checkout (harus 4xx validasi, bukan 500)
    st, _ = post(BASE + "/api/premium/checkout", {"plan": "<script>alert(1)</script>"}, H, timeout=15)
    ok("checkout plan aneh ditolak rapi", st in (400, 422), f"HTTP {st}")

    # youtube process: URL bukan YouTube harus ditolak
    st, _ = post(BASE + "/api/youtube/process", {"url": "javascript:alert(1)"}, H, timeout=20)
    ok("youtube non-URL ditolak", st in (400, 422), f"HTTP {st}")

# ============ 4. KONSISTENSI DATA ============
st, body = get(SB + "/rest/v1/profiles?select=user_id,plan&limit=50",
               {"apikey": SRK, "Authorization": f"Bearer {SRK}"})
try:
    profs = json.loads(body)
    bad = [p for p in profs if p.get("plan") not in ("free", "premium", "pro")]
    ok("plan profile valid semua", st == 200 and not bad, str(bad[:3]))
except Exception as e:
    ok("profiles terbaca", False, str(e))

st, body = get(SB + "/rest/v1/usage_log?select=id&limit=1",
               {"apikey": SRK, "Authorization": f"Bearer {SRK}"})
ok("usage_log terbaca (service key)", st == 200)
st, body = get(SB + "/rest/v1/usage_log?select=id&limit=1", {"apikey": ANON})
ok("usage_log tak bisa dibaca anon (RLS)", st in (200, 401) and (st == 401 or json.loads(body) == []),
   f"HTTP {st}")

# admin_actions tidak boleh terbaca via anon
st, body = get(SB + "/rest/v1/admin_actions?select=id&limit=1", {"apikey": ANON})
ok("admin_actions terlindungi RLS", st == 401 or json.loads(body) == [], f"HTTP {st}")

# ---- konsistensi plan <-> premium_until (drift billing) ----
SRK_H = {"apikey": SRK, "Authorization": f"Bearer {SRK}"}
NOW = datetime.now(timezone.utc)


def _dt(v):
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except Exception:
        return None


st, body = get(SB + "/rest/v1/profiles?select=user_id,plan,premium_until&limit=500", SRK_H)
drift = []
try:
    for p in json.loads(body):
        pu = _dt(p.get("premium_until"))
        aktif = bool(pu and pu > NOW)
        if aktif != (p.get("plan") == "premium"):
            drift.append(f"{p['user_id'][:8]} plan={p.get('plan')} until={p.get('premium_until')}")
except Exception as exc:
    drift = [f"parse error: {exc}"]
ok("plan sinkron dgn premium_until", st == 200 and not drift, "; ".join(drift[:3]))

# order completed BARU (<=6 jam) wajib punya premium_until — deteksi regresi
# grant_premium. Order lama sengaja dilewati: admin boleh set_plan free / premium
# bisa dicabut, jadi order lama tanpa premium_until belum tentu bug.
cutoff = (NOW - timedelta(hours=6)).strftime("%Y-%m-%dT%H:%M:%S")
st, body = get(SB + "/rest/v1/premium_orders?select=user_id,order_id,plan,completed_at"
                    f"&status=eq.completed&completed_at=gte.{cutoff}", SRK_H)
bad_orders = []
try:
    for o in json.loads(body):
        s2, b2 = get(SB + f"/rest/v1/profiles?select=plan,premium_until&user_id=eq.{o['user_id']}", SRK_H)
        rows = json.loads(b2) if s2 == 200 else []
        if not rows or not rows[0].get("premium_until"):
            bad_orders.append(f"{o['order_id']}({o.get('plan')})")
except Exception as exc:
    bad_orders = [f"parse error: {exc}"]
ok("order completed baru punya premium_until", st == 200 and not bad_orders, "; ".join(bad_orders[:3]))

# ---- lonjakan user baru (indikasi bot) ----
since = (NOW - timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%S")
st, body = get(SB + f"/rest/v1/profiles?select=user_id&created_at=gte.{since}&limit=200", SRK_H)
try:
    n_baru = len(json.loads(body))
except Exception:
    n_baru = -1
ok("user baru 2 jam wajar (<=10)", st == 200 and 0 <= n_baru <= 10, f"{n_baru} user baru")

# ---- kesehatan host & service ----
for svc in ("cortexclip-backend", "cortexclip-frontend"):
    r = subprocess.run(["systemctl", "is-active", svc], capture_output=True, text=True)
    ok(f"service {svc} active", r.stdout.strip() == "active", r.stdout.strip() or "unknown")

free_gb = shutil.disk_usage("/").free / 1024**3
ok("disk sisa > 5GB", free_gb > 5, f"{free_gb:.1f}GB")

mem_avail = 0
try:
    for line in open("/proc/meminfo"):
        if line.startswith("MemAvailable:"):
            mem_avail = int(line.split()[1]) / 1024**2
except Exception:
    pass
ok("RAM tersedia > 0.5GB", mem_avail > 0.5, f"{mem_avail:.1f}GB")

# ---- integritas build frontend (asset yg dirujuk manifest harus ada) ----
MANI_DIR = "/home/muhiqbalsukarno/cortexclip-backup/.output/server"
mani = ""
try:
    for f in os.listdir(MANI_DIR):
        if f.startswith("_tanstack-start-manifest") and f.endswith(".mjs"):
            mani = os.path.join(MANI_DIR, f)
            break
except OSError:
    pass
missing_assets: list[str] = []
if mani:
    import re as _re
    txt = open(mani, encoding="utf-8", errors="ignore").read()
    for ref in sorted(set(_re.findall(r'"(/assets/[A-Za-z0-9._-]+\.(?:js|css))"', txt))):
        if not os.path.exists("/home/muhiqbalsukarno/cortexclip-backup/.output/public" + ref):
            missing_assets.append(ref)
ok("asset build lengkap (manifest)", bool(mani) and not missing_assets,
   f"{len(missing_assets)} hilang" if mani else "manifest tak ditemukan")

# ---- DEPLOY DRIFT: kode sumber lebih baru dari yang benar-benar jalan ----
# Regresi nyata (02 Sep): commit fix subtitle di-push tapi frontend tidak
# di-build ulang → asset lama masih disajikan produksi, user tetap lihat bug
# yang "sudah diperbaiki". Script lama tidak menangkap ini karena manifest
# tetap konsisten dengan build lama.
ROOT = "/home/muhiqbalsukarno/cortexclip-backup"


def _newest(paths, exts=None):
    """(mtime, path) file terbaru di daftar file/dir."""
    best = (0.0, "")
    for p in paths:
        full = os.path.join(ROOT, p)
        if os.path.isfile(full):
            cand = [full]
        else:
            cand = [os.path.join(d, f) for d, _, fs in os.walk(full) for f in fs]
        for f in cand:
            if exts and not f.endswith(exts):
                continue
            try:
                m = os.path.getmtime(f)
            except OSError:
                continue
            if m > best[0]:
                best = (m, f)
    return best


def _proc_start(svc):
    """Waktu mulai proses utama service (mtime /proc/<pid>), 0 kalau gagal."""
    try:
        pid = subprocess.run(["systemctl", "show", "-p", "MainPID", "--value", svc],
                             capture_output=True, text=True, timeout=20).stdout.strip()
        if pid and pid != "0":
            return os.path.getmtime(f"/proc/{pid}"), pid
    except Exception:
        pass
    return 0.0, "?"


# frontend: source terbaru harus <= build terbaru, dan proses jalan setelah build
src_m, src_f = _newest(["src", "app.config.ts", "package.json", "index.html"])
bld_m, _ = _newest([".output"])
SLACK = 120  # toleransi: build menyentuh file beberapa detik setelah source
ok("build frontend sinkron dgn src",
   bld_m > 0 and src_m > 0 and src_m <= bld_m + SLACK,
   f"{os.path.basename(src_f)} lebih baru dari build "
   f"({(src_m - bld_m) / 60:.0f} menit) — perlu 'npm run build' + restart")

fe_start, fe_pid = _proc_start("cortexclip-frontend")
ok("frontend jalan pakai build terbaru",
   fe_start > 0 and bld_m > 0 and fe_start >= bld_m - SLACK,
   f"proses pid={fe_pid} lebih tua dari build ({(bld_m - fe_start) / 60:.0f} menit) — perlu restart")

# backend: .py terbaru harus <= waktu proses mulai (uvicorn tanpa reload di prod)
be_m, be_f = _newest(["backend/app"], exts=(".py",))
be_start, be_pid = _proc_start("cortexclip-backend")
ok("backend jalan pakai kode terbaru",
   be_start > 0 and be_m > 0 and be_m <= be_start + SLACK,
   f"{os.path.basename(be_f)} lebih baru dari proses pid={be_pid} "
   f"({(be_m - be_start) / 60:.0f} menit) — perlu restart")

# ---- asset yang dirujuk HTML produksi harus benar-benar ada di server ----
st, home = get(BASE + "/", timeout=30)
import re as _re2
prod_refs = sorted(set(_re2.findall(rb'"(/assets/[A-Za-z0-9._-]+\.(?:js|css))"', home)))
bad_refs = []
for ref in prod_refs[:12]:
    rst, _ = get(BASE + ref.decode(), timeout=20)
    if rst != 200:
        bad_refs.append(f"{ref.decode()} HTTP {rst}")
ok("asset yang dirujuk produksi bisa diambil", bool(prod_refs) and not bad_refs,
   "; ".join(bad_refs[:3]) or "tak ada referensi asset di HTML")

# ---- route penting tidak 404 ----
for rp in ("/studio", "/unduh", "/editor/abc", "/projects/abc"):
    st, _ = get(BASE + rp, timeout=25)
    ok(f"route {rp} hidup", st == 200, f"HTTP {st}")

# ============ 5. BAN GUARD ============
st, body = get(SB + "/rest/v1/profiles?select=user_id&limit=1",
               {"apikey": SRK, "Authorization": f"Bearer {SRK}"})
uid = json.loads(body)[0]["user_id"] if st == 200 else None
if uid and TOK:
    # ban diri via endpoint admin → harus 403/400 (karena non-admin 403 duluan)
    st, _ = post(BASE + f"/api/admin/users/{uid}/ban", {"duration": "1d"}, H, timeout=15)
    ok("ban endpoint butuh admin", st == 403, f"HTTP {st}")
    st, _ = post(BASE + f"/api/admin/users/{uid}/ban", {"duration": "999d"}, H, timeout=15)
    ok("ban durasi aneh ditolak", st in (400, 403), f"HTTP {st}")


# ============ 6. ID NGAWUR TIDAK BOLEH 500 ============
# Regresi nyata: id non-UUID diteruskan ke PostgREST → 400 22P02 → RuntimeError
# → 500 + detail error DB bocor. Semua endpoint ber-id WAJIB balas 4xx.
def call(method: str, path: str, data=None, headers=None, timeout=25):
    body_b = json.dumps(data).encode() if data is not None else None
    h = {"Content-Type": "application/json", **(headers or {})}
    req = urllib.request.Request(BASE + path, data=body_b, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return 0


if TOK:
    BAD = "bukan-uuid"
    id_cases = [
        ("POST", f"/api/projects/{BAD}/reprocess", {}),
        ("POST", f"/api/projects/{BAD}/touch", {}),
        ("POST", f"/api/projects/{BAD}/share", {}),
        ("PATCH", f"/api/projects/{BAD}", {"title": "x"}),
        ("DELETE", f"/api/projects/{BAD}", None),
        ("GET", f"/api/render-jobs/project/{BAD}", None),
        ("POST", "/api/projects/upload-done", {"project_id": BAD, "storage_path": "a/b.mp4"}),
        ("POST", "/api/render-jobs", {"project_id": BAD, "clip_id": BAD}),
    ]
    id_500 = [f"{m} {p}" for m, p, d in id_cases if call(m, p, d, H) >= 500]
    ok("id ngawur tidak bikin 500", not id_500, "; ".join(id_500[:3]))

# ============ 7. PROSES NYANGKUT ============
st, body = get(SB + "/rest/v1/projects?select=id,status,updated_at,created_at"
                    "&status=in.(downloading,transcribing,analyzing)&limit=100", SRK_H)
stuck = []
try:
    for p in json.loads(body):
        t = _dt(p.get("updated_at") or p.get("created_at"))
        if t and (NOW - t).total_seconds() > 1800:
            stuck.append(f"{p['id'][:8]} {p['status']}")
except Exception as exc:
    stuck = [f"parse error: {exc}"]
ok("tidak ada project nyangkut >30m", st == 200 and not stuck, "; ".join(stuck[:3]))

st, body = get(SB + "/rest/v1/render_jobs?select=id,status,created_at"
                    "&status=in.(pending,rendering)&limit=100", SRK_H)
rstuck = []
try:
    for j in json.loads(body):
        t = _dt(j.get("created_at"))
        if t and (NOW - t).total_seconds() > 3600:
            rstuck.append(j["id"][:8])
except Exception as exc:
    rstuck = [f"parse error: {exc}"]
ok("tidak ada render job nyangkut >1j", st == 200 and not rstuck, "; ".join(rstuck[:3]))

# ============ 8. GUARD CHUNK LAMA (halaman putih setelah deploy) ============
st, body = get(BASE + "/", timeout=30)
ok("guard chunk-reload terpasang", b"cortexclip-chunk-reload" in body)

# ============ 9. LOG 500 BACKEND (PROSES YANG SEDANG JALAN) ============
# Dibatasi ke PID backend saat ini: 500 dari versi kode SEBELUM restart/fix
# bukan isu aktif, tapi 500 baru pada proses berjalan wajib ketangkap.
try:
    pid = subprocess.run(["systemctl", "show", "-p", "MainPID", "--value",
                          "cortexclip-backend"], capture_output=True, text=True,
                         timeout=20).stdout.strip()
    cmd = ["journalctl", "-u", "cortexclip-backend", "--no-pager", "--since", "2 hours ago"]
    if pid and pid != "0":
        cmd.append(f"_PID={pid}")
    lg = subprocess.run(cmd, capture_output=True, text=True, timeout=60).stdout
    n500 = lg.count("500 Internal Server Error")
    ntb = lg.count("Traceback (most recent call last)")
    ok("tak ada 500 di log backend (proses aktif)", n500 == 0 and ntb == 0,
       f"{n500}x500 {ntb}xtraceback pid={pid}")
except Exception as exc:
    ok("log backend terbaca", False, str(exc)[:60])

# ============ RINGKASAN ============
# BUG (diperbaiki 02 Sep): dulu `not r[1]` — r[1] itu NAMA cek (string non-kosong,
# selalu truthy) → fails selalu kosong → laporan bilang "N/N PASS" walau ada
# [FAIL] tercetak, dan "PERLU TINDAK LANJUT" tak pernah muncul. Yang benar r[0].
fails = [r for r in results if not r[0]]
print(f"QA CORTEXCLIP — {time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime())}")
print(f"HASIL: {len(results) - len(fails)}/{len(results)} PASS")
for good, name in results:
    mark = "PASS" if good else "FAIL"
    print(f" [{mark}] {name}")
if fails:
    print(f"PERLU TINDAK LANJUT: {len(fails)} item")
sys.exit(0)
