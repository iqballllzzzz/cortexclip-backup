"""SOCIAL AUTO PUBLISHING — sambungkan akun, jadwalkan, tayangkan.

ALUR YANG DIMINTA PENGGUNA
  1. buka halaman → "sambungkan sosial media anda terlebih dahulu"
  2. pilih YouTube atau TikTok (dengan logonya)
  3. masukkan NAMA PROFIL akun yang dituju
  4. tekan Connect → dilempar ke OAuth (Google untuk YouTube; TikTok punya
     beberapa jalur login: Google/Facebook/email — pengguna memilih)
  5. setelah tersambung → pilih proyek (satu-satu atau semua)
  6. atur jadwal (opsional; kalau dilewat, sistem menyebar sendiri)
  7. "proyek anda akan otomatis ter-publish pada jam segini"
  8. pengguna bisa melihat & MEMBATALKAN yang terjadwal
  9. judul, deskripsi, hashtag dibuat otomatis

KENAPA TOKEN DISIMPAN DI DATABASE
Penjadwal berjalan di server tanpa pengguna hadir — itu inti fiturnya. Token
tidak bisa hidup di browser. Baris dilindungi RLS (pengguna hanya melihat
miliknya); backend memakai service key dan MENYARING per user_id di setiap
query, bukan mengandalkan RLS saja.

MODE TANPA KREDENSIAL
Kalau GOOGLE_CLIENT_ID / TIKTOK_CLIENT_KEY belum diisi di .env, endpoint
/api/social/connect mengembalikan 503 dengan pesan jelas — BUKAN diam-diam
gagal atau memalsukan sukses. Penjadwal tetap jalan dan menandai job
'failed' dengan alasan yang sama, jadi tidak ada job menggantung selamanya.
"""
from __future__ import annotations

import os
import re
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from urllib.parse import urlencode

import httpx

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "https://cortexclip.eu.cc").rstrip("/")

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
TIKTOK_CLIENT_KEY = os.getenv("TIKTOK_CLIENT_KEY", "")
TIKTOK_CLIENT_SECRET = os.getenv("TIKTOK_CLIENT_SECRET", "")

# YouTube butuh upload scope; readonly untuk mengambil nama channel supaya bisa
# dicocokkan dengan profile_name yang diisi pengguna.
YT_SCOPES = ("https://www.googleapis.com/auth/youtube.upload "
             "https://www.googleapis.com/auth/youtube.readonly")
TIKTOK_SCOPES = "user.info.basic,video.upload,video.publish"

PLATFORMS = ("youtube", "tiktok")
# TikTok memang punya banyak jalur masuk; pengguna memilih yang dia pakai.
# Ini hanya CATATAN untuk pengguna — TikTok OAuth tetap satu endpoint;
# layar TikTok sendiri yang menampilkan pilihan Google/Facebook/email.
TIKTOK_LOGIN_METHODS = ("google", "facebook", "email", "phone", "apple", "twitter")

JAM_TAYANG_BAIK = (7, 12, 15, 18, 20, 21)   # jam ramai penonton Indonesia
JEDA_MIN_MENIT = 45                          # antar unggahan di akun yang sama


# --------------------------------------------------------------------- db
def _headers() -> dict[str, str]:
    return {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "application/json"}


async def _sb(method: str, path: str, **kw) -> Any:
    async with httpx.AsyncClient(timeout=25) as c:
        r = await c.request(method, f"{SUPABASE_URL}/rest/v1/{path}",
                            headers={**_headers(),
                                     "Prefer": "return=representation"}, **kw)
        if r.status_code >= 300:
            raise RuntimeError(f"supabase {r.status_code}: {r.text[:200]}")
        try:
            return r.json()
        except Exception:
            return None


def kredensial_siap(platform: str) -> bool:
    if platform == "youtube":
        return bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)
    if platform == "tiktok":
        return bool(TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET)
    return False


def status_platform() -> dict[str, Any]:
    """Platform mana yang siap dipakai — dibaca UI supaya tombolnya jujur."""
    return {
        "youtube": {"siap": kredensial_siap("youtube"),
                    "alasan": None if kredensial_siap("youtube")
                    else "GOOGLE_CLIENT_ID/SECRET belum diatur di server"},
        "tiktok": {"siap": kredensial_siap("tiktok"),
                   "alasan": None if kredensial_siap("tiktok")
                   else "TIKTOK_CLIENT_KEY/SECRET belum diatur di server",
                   "login_methods": list(TIKTOK_LOGIN_METHODS)},
    }


# ------------------------------------------------------------------ OAuth
def redirect_uri(platform: str) -> str:
    return f"{PUBLIC_BASE_URL}/api/social/callback/{platform}"


async def mulai_koneksi(user_id: str, platform: str, profile_name: str,
                        login_method: Optional[str] = None) -> dict[str, Any]:
    """Buat baris pending + kembalikan URL OAuth yang harus dibuka pengguna."""
    platform = platform.lower().strip()
    if platform not in PLATFORMS:
        raise ValueError("platform harus 'youtube' atau 'tiktok'")
    profile_name = (profile_name or "").strip()
    if len(profile_name) < 2:
        raise ValueError("Nama profil sosial media wajib diisi (min 2 karakter)")
    if not kredensial_siap(platform):
        raise PermissionError(
            f"Integrasi {platform} belum aktif di server ini. "
            f"Admin perlu mengisi kredensial OAuth {platform} dulu.")

    state = secrets.token_urlsafe(24)
    rows = await _sb("POST", "social_accounts", json=[{
        "user_id": user_id, "platform": platform,
        "profile_name": profile_name,
        "login_method": (login_method or None),
        "status": "pending", "oauth_state": state,
    }])
    acc = rows[0] if rows else {}

    if platform == "youtube":
        url = "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode({
            "client_id": GOOGLE_CLIENT_ID,
            "redirect_uri": redirect_uri("youtube"),
            "response_type": "code",
            "scope": YT_SCOPES,
            "access_type": "offline",       # WAJIB: butuh refresh_token
            "prompt": "consent select_account",
            "include_granted_scopes": "true",
            "state": state,
        })
    else:
        url = "https://www.tiktok.com/v2/auth/authorize/?" + urlencode({
            "client_key": TIKTOK_CLIENT_KEY,
            "redirect_uri": redirect_uri("tiktok"),
            "response_type": "code",
            "scope": TIKTOK_SCOPES,
            "state": state,
        })
    return {"account_id": acc.get("id"), "auth_url": url, "state": state,
            "platform": platform, "profile_name": profile_name}


async def selesaikan_koneksi(platform: str, code: str,
                             state: str) -> dict[str, Any]:
    """Tukar code → token, ambil identitas akun, cocokkan dengan profile_name."""
    rows = await _sb("GET", f"social_accounts?oauth_state=eq.{state}"
                            "&select=id,user_id,platform,profile_name,login_method")
    if not rows:
        raise ValueError("State OAuth tidak dikenal / sudah dipakai")
    acc = rows[0]
    if acc["platform"] != platform:
        raise ValueError("Platform pada callback tidak cocok")

    if platform == "youtube":
        tok = await _tukar_google(code)
        ident = await _identitas_youtube(tok["access_token"])
    else:
        tok = await _tukar_tiktok(code)
        ident = await _identitas_tiktok(tok["access_token"])

    exp = None
    if tok.get("expires_in"):
        exp = (datetime.now(timezone.utc)
               + timedelta(seconds=int(tok["expires_in"]) - 60)).isoformat()

    # Kesesuaian nama: PERINGATAN, bukan penolakan. Nama channel sering
    # berbeda dari yang diingat pengguna (@handle vs nama tampilan), jadi
    # menolak koneksi karena beda huruf akan lebih menyakitkan daripada
    # membantu. Tetap dilaporkan supaya pengguna bisa mengoreksi.
    cocok = _nama_mirip(acc.get("profile_name") or "", ident.get("name") or "")

    patch = {
        "status": "connected", "oauth_state": None,
        "account_id": ident.get("id"), "account_name": ident.get("name"),
        "avatar_url": ident.get("avatar"),
        "access_token": tok.get("access_token"),
        "refresh_token": tok.get("refresh_token"),
        "expires_at": exp, "scopes": tok.get("scope"),
        "error_message": None if cocok else
        f"Nama akun terhubung ('{ident.get('name')}') berbeda dari yang kamu "
        f"tulis ('{acc.get('profile_name')}'). Cek apakah akun yang dipilih benar.",
    }
    await _sb("PATCH", f"social_accounts?id=eq.{acc['id']}", json=patch)
    return {"ok": True, "account": {**acc, **patch,
                                    "access_token": None, "refresh_token": None},
            "nama_cocok": cocok}


def _nama_mirip(a: str, b: str) -> bool:
    """Longgar: huruf-angka saja, tanpa spasi/@ , case-insensitive, substring."""
    def bersih(s: str) -> str:
        return re.sub(r"[^a-z0-9]", "", s.lower())
    x, y = bersih(a), bersih(b)
    if not x or not y:
        return False
    return x in y or y in x


async def _tukar_google(code: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post("https://oauth2.googleapis.com/token", data={
            "code": code, "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri": redirect_uri("youtube"),
            "grant_type": "authorization_code",
        })
    if r.status_code >= 300:
        raise RuntimeError(f"Google token gagal: {r.text[:200]}")
    return r.json()


async def _segarkan_google(refresh_token: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post("https://oauth2.googleapis.com/token", data={
            "refresh_token": refresh_token, "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "grant_type": "refresh_token",
        })
    if r.status_code >= 300:
        raise RuntimeError(f"Refresh Google gagal: {r.text[:200]}")
    return r.json()


async def _identitas_youtube(access_token: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get("https://www.googleapis.com/youtube/v3/channels",
                        params={"part": "snippet", "mine": "true"},
                        headers={"Authorization": f"Bearer {access_token}"})
    if r.status_code >= 300:
        return {"id": None, "name": None, "avatar": None}
    items = (r.json().get("items") or [])
    if not items:
        return {"id": None, "name": None, "avatar": None}
    sn = items[0].get("snippet") or {}
    thumb = ((sn.get("thumbnails") or {}).get("default") or {}).get("url")
    return {"id": items[0].get("id"), "name": sn.get("title"), "avatar": thumb}


async def _tukar_tiktok(code: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post("https://open.tiktokapis.com/v2/oauth/token/", data={
            "client_key": TIKTOK_CLIENT_KEY,
            "client_secret": TIKTOK_CLIENT_SECRET,
            "code": code, "grant_type": "authorization_code",
            "redirect_uri": redirect_uri("tiktok"),
        }, headers={"Content-Type": "application/x-www-form-urlencoded"})
    if r.status_code >= 300:
        raise RuntimeError(f"TikTok token gagal: {r.text[:200]}")
    return r.json()


async def _segarkan_tiktok(refresh_token: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post("https://open.tiktokapis.com/v2/oauth/token/", data={
            "client_key": TIKTOK_CLIENT_KEY,
            "client_secret": TIKTOK_CLIENT_SECRET,
            "grant_type": "refresh_token", "refresh_token": refresh_token,
        }, headers={"Content-Type": "application/x-www-form-urlencoded"})
    if r.status_code >= 300:
        raise RuntimeError(f"Refresh TikTok gagal: {r.text[:200]}")
    return r.json()


async def _identitas_tiktok(access_token: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.get("https://open.tiktokapis.com/v2/user/info/",
                        params={"fields": "open_id,display_name,avatar_url"},
                        headers={"Authorization": f"Bearer {access_token}"})
    if r.status_code >= 300:
        return {"id": None, "name": None, "avatar": None}
    d = ((r.json().get("data") or {}).get("user") or {})
    return {"id": d.get("open_id"), "name": d.get("display_name"),
            "avatar": d.get("avatar_url")}


async def token_valid(acc: dict[str, Any]) -> str:
    """access_token yang pasti masih hidup — refresh otomatis kalau kedaluwarsa."""
    exp = acc.get("expires_at")
    perlu = True
    if exp:
        try:
            perlu = datetime.fromisoformat(str(exp).replace("Z", "+00:00")) \
                <= datetime.now(timezone.utc) + timedelta(minutes=2)
        except Exception:
            perlu = True
    if not perlu and acc.get("access_token"):
        return str(acc["access_token"])

    rt = acc.get("refresh_token")
    if not rt:
        raise RuntimeError("Akun perlu disambungkan ulang (tidak ada refresh token)")
    tok = (await _segarkan_google(rt) if acc["platform"] == "youtube"
           else await _segarkan_tiktok(rt))
    exp_baru = None
    if tok.get("expires_in"):
        exp_baru = (datetime.now(timezone.utc)
                    + timedelta(seconds=int(tok["expires_in"]) - 60)).isoformat()
    await _sb("PATCH", f"social_accounts?id=eq.{acc['id']}", json={
        "access_token": tok.get("access_token"),
        "refresh_token": tok.get("refresh_token") or rt,
        "expires_at": exp_baru, "status": "connected"})
    return str(tok.get("access_token"))
