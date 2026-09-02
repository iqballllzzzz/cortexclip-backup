"""STT cadangan TERAKHIR: aidictation.com (butuh token Cloudflare Turnstile).

Dipakai HANYA kalau seluruh rantai utama gagal (Groq → Gemini → HF Space →
lokal). Layanan pihak ketiga tanpa kontrak: dianggap boleh mati kapan saja,
karena itu semua kegagalan ditelan dan mengembalikan None (pipeline tetap
memakai jalur lain).

Token Turnstile didapat dari solver yang bisa dikonfigurasi via env:
  AIDICTATION_SOLVER_URL   (default: https://cf.rynekoo.eu.cc/action)
  AIDICTATION_SITEKEY      (default sitekey publik halaman aidictation)
  AIDICTATION_ENABLED=0    mematikan jalur ini sepenuhnya
Kalau solver mati (mis. 530 Cloudflare Tunnel error), fungsi langsung
menyerah tanpa menahan pipeline.
"""
from __future__ import annotations

import os
import re
import time
from typing import Any

import httpx

ENABLED = os.environ.get("AIDICTATION_ENABLED", "1") not in ("0", "false", "no")
SOLVER_URL = os.environ.get("AIDICTATION_SOLVER_URL",
                            "https://cf.rynekoo.eu.cc/action")
SITEKEY = os.environ.get("AIDICTATION_SITEKEY", "0x4AAAAAACgbDnY2xQyOrOfk")
PAGE = "https://aidictation.com/tools/transcribe"
API = "https://aidictation.com/api/transcribe"
UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")

SOLVER_TIMEOUT = float(os.environ.get("AIDICTATION_SOLVER_TIMEOUT", "90"))
API_TIMEOUT = float(os.environ.get("AIDICTATION_API_TIMEOUT", "300"))

# cache token: Turnstile berlaku beberapa menit; hemat panggilan solver
_token_cache: dict[str, Any] = {"token": None, "exp": 0.0}
# circuit breaker: kalau solver mati, jangan coba lagi selama N detik
_cooldown_until = 0.0
COOLDOWN = float(os.environ.get("AIDICTATION_COOLDOWN", "900"))


def _sitekey_from_page() -> str | None:
    """Ambil sitekey langsung dari HTML halaman (kalau berubah sewaktu-waktu)."""
    try:
        r = httpx.get(PAGE, headers={"User-Agent": UA}, timeout=45,
                      follow_redirects=True)
        if r.status_code != 200:
            return None
        m = re.search(r"0x4[A-Za-z0-9_-]{15,}", r.text)
        return m.group(0) if m else None
    except Exception:
        return None


async def _turnstile_token() -> str | None:
    now = time.time()
    if _token_cache["token"] and now < _token_cache["exp"]:
        return str(_token_cache["token"])
    sitekey = SITEKEY or _sitekey_from_page()
    if not sitekey:
        return None
    payload = {"url": PAGE, "siteKey": sitekey, "mode": "turnstile-min"}
    try:
        async with httpx.AsyncClient(timeout=SOLVER_TIMEOUT) as client:
            r = await client.post(SOLVER_URL, json=payload,
                                  headers={"User-Agent": UA})
    except Exception as exc:
        print(f"[aidictation] solver tidak bisa dihubungi: {type(exc).__name__}")
        return None
    if r.status_code != 200:
        print(f"[aidictation] solver status {r.status_code} (mati/rate-limit)")
        return None
    try:
        data = r.json()
    except Exception:
        print("[aidictation] solver balas non-JSON")
        return None
    token = None
    if isinstance(data, dict):
        token = ((data.get("data") or {}).get("token")
                 if isinstance(data.get("data"), dict) else None)
        token = token or data.get("token")
    if not token:
        return None
    _token_cache["token"] = str(token)
    _token_cache["exp"] = now + 240      # aman di bawah masa berlaku Turnstile
    return str(token)


def _parse(data: Any, duration: float) -> dict[str, Any] | None:
    """Normalkan respons aidictation → {segments, text, stt_provider}."""
    if not isinstance(data, dict):
        return None
    # bentuk yang mungkin: {text}, {transcript}, {segments:[...]}, {data:{...}}
    inner: dict[str, Any] = data
    if isinstance(data.get("data"), dict):
        inner = data["data"]
    segs_raw = (inner.get("segments") or inner.get("chunks")
                or inner.get("results") or [])
    segments: list[dict[str, Any]] = []
    if isinstance(segs_raw, list):
        for s in segs_raw:
            if not isinstance(s, dict):
                continue
            text = str(s.get("text") or s.get("transcript") or "").strip()
            if not text:
                continue
            ts = s.get("start", s.get("from", s.get("offset")))
            te = s.get("end", s.get("to"))
            if ts is None or te is None:
                continue
            try:
                st_ = float(ts)
                en_ = float(te)
            except (TypeError, ValueError):
                continue
            # beberapa API pakai milidetik
            if en_ > duration * 10 and en_ > 1000:
                st_, en_ = st_ / 1000.0, en_ / 1000.0
            if en_ <= st_:
                continue
            segments.append({"start": round(st_, 2), "end": round(en_, 2),
                             "text": text})
    if segments:
        return {"segments": segments,
                "text": " ".join(s["text"] for s in segments),
                "stt_provider": "aidictation"}
    full = str(inner.get("text") or inner.get("transcript") or "").strip()
    if full:
        # tanpa timing → bagi merata per kalimat (pemanggil sudah menangani ini)
        return {"segments": [], "text": full, "stt_provider": "aidictation"}
    return None


async def transcribe_aidictation(audio_bytes: bytes,
                                 duration: float = 600.0,
                                 mime: str = "audio/mpeg",
                                 filename: str | None = None
                                 ) -> dict[str, Any] | None:
    """Transkripsi via aidictation. None kalau gagal (tidak pernah raise)."""
    global _cooldown_until
    if not ENABLED:
        return None
    now = time.time()
    if now < _cooldown_until:
        return None
    token = await _turnstile_token()
    if not token:
        _cooldown_until = now + COOLDOWN
        print(f"[aidictation] tanpa token → nonaktif {int(COOLDOWN)}s")
        return None
    name = filename or f"{int(now)}_cortexclip.mp3"
    try:
        async with httpx.AsyncClient(timeout=API_TIMEOUT) as client:
            r = await client.post(
                API,
                files={"file": (name, audio_bytes, mime)},
                data={"turnstile_token": token},
                headers={"User-Agent": UA,
                         "origin": "https://aidictation.com",
                         "referer": PAGE},
            )
    except Exception as exc:
        print(f"[aidictation] request gagal: {type(exc).__name__}")
        return None
    if r.status_code != 200:
        # token kadaluarsa → buang cache supaya percobaan berikutnya minta baru
        _token_cache["token"], _token_cache["exp"] = None, 0.0
        print(f"[aidictation] status {r.status_code}: {r.text[:120]}")
        if r.status_code in (401, 403, 429):
            _cooldown_until = now + COOLDOWN
        return None
    try:
        return _parse(r.json(), duration)
    except Exception as exc:
        print(f"[aidictation] parse gagal: {type(exc).__name__}")
        return None


def health() -> dict[str, Any]:
    """Status jalur ini untuk endpoint admin/monitor."""
    return {
        "enabled": ENABLED,
        "solver": SOLVER_URL,
        "cooldown_remaining": max(0, int(_cooldown_until - time.time())),
        "token_cached": bool(_token_cache["token"]),
    }
