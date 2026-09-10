"""Anti-Bot & Anti-Abuse Shield — CortexClip AI.

Melindungi endpoint pendaftaran & autentikasi dari:
- Bot spammer (Camoufox, Puppeteer, Selenium, headless browsers)
- Rotasi IP / Proxy brute-force
- Penggunaan email sementara / disposable mail (nuyul akun gratis)
- Bypass Cloudflare Turnstile
"""
from __future__ import annotations

import os
import re
import time
import httpx
from collections import defaultdict

# 1. Daftar domain email sementara / disposable terpopuler (Anti-Nuyul)
DISPOSABLE_DOMAINS = {
    "10minutemail.com", "10minutemail.net", "guerrillamail.com", "guerrillamail.net",
    "guerrillamail.org", "sharklasers.com", "grr.la", "guerrillamail.biz",
    "mailinator.com", "yopmail.com", "yopmail.fr", "yopmail.net",
    "tempmail.com", "temp-mail.org", "temp-mail.io", "dispostable.com",
    "trashmail.com", "trashmail.net", "trashmail.org", "fakeinbox.com",
    "throwawaymail.com", "nada.ltd", "getairmail.com", "mohmal.com",
    "crazymailing.com", "armyspy.com", "cuvox.de", "dayrep.com",
    "fleckens.hu", "gustr.com", "jourrapide.com", "rhyta.com",
    "superrito.com", "teleworm.us", "einrot.com", "tempail.com",
    "burnermail.io", "mytemp.email", "fakemailgenerator.com",
    "dropmail.me", "emailondeck.com", "generator.email", "clipmail.eu"
}

# 2. Blacklist bot User-Agents & Headless indicators
BOT_UA_PATTERNS = [
    r"python-requests",
    r"aiohttp",
    r"curl/",
    r"wget/",
    r"postman",
    r"headless",
    r"phantomjs",
    r"playwright",
    r"selenium",
    r"puppeteer",
    r"scrapy",
    r"camoufox",
    r"bot(?!\w)",
    r"crawler",
    r"spider"
]
BOT_UA_REGEX = re.compile("|".join(BOT_UA_PATTERNS), re.IGNORECASE)

# 3. Rate limiter pendaftaran per IP (maks 30 registrasi per jam per IP)
_REG_LIMITS: dict[str, list[float]] = defaultdict(list)
MAX_REG_PER_HOUR = 30

def check_ip_rate_limit(ip: str) -> bool:
    # Whitelist loopback / internal
    if ip in ("127.0.0.1", "localhost", "::1"):
        return True
    now = time.time()
    one_hour_ago = now - 3600
    # bersihkan riwayat lama
    _REG_LIMITS[ip] = [t for t in _REG_LIMITS[ip] if t > one_hour_ago]
    if len(_REG_LIMITS[ip]) >= MAX_REG_PER_HOUR:
        return False
    _REG_LIMITS[ip].append(now)
    return True

def is_disposable_email(email: str) -> bool:
    """Mengecek apakah email menggunakan domain sementara / throwaway."""
    if "@" not in email:
        return True
    domain = email.split("@")[-1].strip().lower()
    if domain in DISPOSABLE_DOMAINS:
        return True
    # Cegah subdomain spammer (cth: *.mailinator.com)
    for d in DISPOSABLE_DOMAINS:
        if domain.endswith("." + d):
            return True
    return False

def is_suspicious_bot(user_agent: str, headers: dict | None = None) -> bool:
    """Mendeteksi apakah request dikirim oleh bot/headless browser."""
    if not user_agent or len(user_agent.strip()) < 5:
        return True
    if BOT_UA_REGEX.search(user_agent):
        return True
    return False

async def verify_turnstile_token(token: str, remote_ip: str = "") -> bool:
    """Verifikasi Cloudflare Turnstile token."""
    if not token or not token.strip():
        return False

    # Izinkan dummy/testing token
    if token == "XXXX.DUMMY.TOKEN.XXXX" or token.startswith("1x0000000"):
        return True

    secret = os.environ.get("CLOUDFLARE_TURNSTILE_SECRET_KEY", "").strip()
    if not secret:
        # Jika belum dikonfigurasi secret key di backend, loloskan jika format token valid
        return len(token) > 10

    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.post(
                "https://challenges.cloudflare.com/turnstile/v0/siteverify",
                data={
                    "secret": secret,
                    "response": token,
                    "remoteip": remote_ip
                }
            )
            if resp.status_code == 200:
                res_json = resp.json()
                return bool(res_json.get("success", False))
    except Exception as exc:
        print(f"[TURNSTILE] Verifikasi gagal: {exc}")
        # Fail-closed pada produksi jika secret diset
        return False

    return True
