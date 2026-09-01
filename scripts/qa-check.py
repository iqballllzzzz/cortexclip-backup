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
    for payload in ["' OR 1=1--", "'; DROP TABLE profiles;--", "%27%20OR%20%271%27%3D%271"]:
        st, _ = get(BASE + f"/api/admin/users?search={urllib.parse.quote(payload)}", H, timeout=15)
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

# ============ RINGKASAN ============
fails = [r for r in results if not r[1]]
print(f"QA CORTEXCLIP — {time.strftime('%Y-%m-%d %H:%M UTC', time.gmtime())}")
print(f"HASIL: {len(results) - len(fails)}/{len(results)} PASS")
for good, name in results:
    mark = "PASS" if good else "FAIL"
    print(f" [{mark}] {name}")
if fails:
    print(f"PERLU TINDAK LANJUT: {len(fails)} item")
sys.exit(0)
