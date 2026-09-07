"""Provider-providеr unduhan video dari gist.rynekoo.eu.cc — diuji nyata 2026-09-07.

Semua fungsi mengikuti pola yg sama: ambil URL media langsung (video/mp4)
yang siap diunduh VPS (bukan googlevideo terikat IP). Provider yang lolos uji:
  - densave          (X/Twitter, YouTube)  via downloaderapi.densavedownloader.app
  - aio-rapidapi     (X, TikTok, IG, YouTube)  via auto-download-all-in-one
  - savetik          (TikTok)              via savetik.app (AES-CBC)
  - savetube         (YouTube)             via savetube.vip (AES-128, cdn dinamis)
  - snaptwitt        (X/Twitter)           via snaptwitt.com WP-API
  - ssvid            (IG, TikTok)          via ssvid.net
  - tweeterdownloader(X/Twitter)           via tweeterdownloader.com WP-API
  - vibetik          (TikTok)              via vibetik.net (okhttp)
  - ytdl-rapidapi    (YouTube)             via ytstream-download-youtube-videos
  - ytscribeto       (X/Twitter)           via ytscribeto.com Elementor form

Provider yang GAGAL diuji (tidak dipakai): downr (403), savetube sebagian.
"""
from __future__ import annotations

import base64
import json
import os
import re
import time
import uuid
from typing import Any, Optional

import httpx

UA_MOBILE = (
    "Mozilla/5.0 (Linux; Android 15; SM-F958 Build/AP3A.240905.015) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.86 Mobile Safari/537.36"
)
UA_OPERA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/93.0.4577.63 Safari/537.36 OPR/78.0.4093.184"
)
UA_OKHTTP = "okhttp/4.12.0"

RAPID_AUTOLINK_KEY = os.environ.get("RAPIDAPI_AUTOLINK_KEY", "ca5c6d6fa3mshfcd2b0a0feac6b7p140e57jsn72684628152a")
RAPID_YTSTREAM_KEY = os.environ.get("RAPIDAPI_YTSTREAM_KEY", "6fabfe3ba0msha10853256d5c5f9p1c1247jsnf1625ea46cb6")


# ---------------------------------------------------------------------------
# Bantuan umum
# ---------------------------------------------------------------------------
async def _post_json(url: str, payload: dict, headers: dict, timeout: float = 60) -> dict:
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        r = await client.post(url, json=payload, headers=headers)
    r.raise_for_status()
    return r.json()


async def _get_json(url: str, headers: dict, timeout: float = 60) -> Any:
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        r = await client.get(url, headers=headers)
    r.raise_for_status()
    return r.json()


async def _post_form(url: str, fields: dict, headers: dict, timeout: float = 60) -> Any:
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        r = await client.post(url, data=fields, headers=headers)
    r.raise_for_status()
    return r.json()


def _first_media(medias: list[dict]) -> Optional[dict]:
    """Pilih media video mp4 (bukan gambar/thumbnail) dengan resolusi terbaik."""
    def _is_video(m: dict) -> bool:
        ct = str(m.get("type") or m.get("content_type") or m.get("ext") or "")
        url = str(m.get("url") or m.get("media") or m.get("download_url") or "")
        return ("video" in ct.lower() or ct.lower().endswith(".mp4")
                or ".mp4" in url.lower() or "video" in url.lower()
                or "videoplayback" in url.lower() or "ext_tw_video" in url.lower()
                or ".webp" not in url.lower() and ".jpg" not in url.lower() and ".png" not in url.lower())

    vids = [m for m in medias if _is_video(m)]
    if not vids:
        return None
    def _res(m: dict) -> int:
        r = str(m.get("resolution") or m.get("qualityLabel") or m.get("quality") or "0")
        m2 = re.search(r"(\d{2,4})x(\d{2,4})", r)
        if m2:
            return int(m2.group(2))
        m3 = re.search(r"\d{3,4}", r)
        return int(m3.group(0)) if m3 else 0
    vids.sort(key=_res, reverse=True)
    for m in vids:
        url = m.get("url") or m.get("media") or m.get("download_url")
        if url:
            return m
    return None


def _pick_mp4(streams: list[dict]) -> Optional[str]:
    """Dari daftar stream Piped/savetube style (videoStreams), pilih URL video mp4 terbaik."""
    vids = [s for s in streams if s.get("url") and str(s.get("format", "")).upper() in ("MPEG_4", "MP4", "")]
    if not vids:
        vids = [s for s in streams if s.get("url")]
    vids.sort(key=lambda s: int(str(s.get("quality", "0")).replace("p", "") or 0), reverse=True)
    return vids[0]["url"] if vids else None


# ---------------------------------------------------------------------------
# 1) densave — X/Twitter & YouTube (multipart + x-token/x-appkey/x-appcode)
# ---------------------------------------------------------------------------
async def prov_densave(url: str) -> dict[str, Any]:
    boundary = "----WebKitFormBoundary" + uuid.uuid4().hex
    body = b""
    for k, v in (("url", url), ("cookie", "")):
        body += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode()
    body += f"--{boundary}--\r\n".encode()
    headers = {
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Referer": "https://downloaderapi.densavedownloader.app/",
        "User-Agent": UA_MOBILE,
        "X-Token": "yYZykcBmkPRNI5ZIv6hR6gl0fpiC5pT3TSdCx+b2bHreeGWgWUDCtbyLh6UOKEDGqH3ytAC9ZhXA85VOyyCxVQ==",
        "X-Appkey": "hYsnMLnhN7g7TA4lTLngCWC11IfqUDxawxhB0eZYO0WIEXHU9FwwDgT1nPOP5g8L",
        "X-Appcode": "haticitwitter",
        "X-Devicedata": '{"platformDeviceId":"1d49e7a631964b6a","appVersion":75,"osVersion":"Android 10","osSdkVersion":"29","deviceModel":"SM-J700F","locale":"id-ID"}',
        "Cache-Control": "no-cache",
        "Accept": "application/json, text/plain, */*",
    }
    async with httpx.AsyncClient(timeout=90, follow_redirects=True) as client:
        r = await client.post(
            "https://downloaderapi.densavedownloader.app/index.php?action=extract",
            content=body, headers=headers)
    r.raise_for_status()
    d = r.json()
    if d.get("status") != "success" or not d.get("formats"):
        raise RuntimeError(f"densave: {str(d)[:100]}")
    fmts = d["formats"]
    # pilih resolusi tertinggi
    best = max(fmts, key=lambda f: int(str(f.get("resolution", "0x0")).split("x")[1] or 0))
    return {"title": d.get("title") or "video", "duration": float(d.get("duration") or 0),
            "url": best["url"], "provider": "densave"}


# ---------------------------------------------------------------------------
# 2) aio-rapidapi — multi-platform
# ---------------------------------------------------------------------------
async def prov_aio(url: str, title_fallback: str = "") -> dict[str, Any]:
    d = await _post_json(
        "https://auto-download-all-in-one.p.rapidapi.com/v1/social/autolink",
        {"url": url},
        {"Content-Type": "application/json; charset=utf-8", "User-Agent": UA_OPERA,
         "X-RapidAPI-Host": "auto-download-all-in-one.p.rapidapi.com",
         "X-RapidAPI-Key": RAPID_AUTOLINK_KEY},
        timeout=90)
    medias = d.get("medias") or []
    if not medias:
        raise RuntimeError("aio: tanpa media")
    m = _first_media(medias)
    if not m:
        raise RuntimeError("aio: tanpa url media")
    return {"title": d.get("title") or title_fallback or "video",
            "duration": float(d.get("duration") or 0), "url": m.get("url") or m.get("media"),
            "provider": "aio-rapidapi"}


# ---------------------------------------------------------------------------
# 3) savetik — TikTok (AES-CBC)
# ---------------------------------------------------------------------------
_SAVETIK_ENC = b"GJvE5RZIxrl9SuNrAtgsvCfWha3M7NGC"
_SAVETIK_DEC = b"H3quWdWoHLX5bZSlyCYAnvDFara25FIu"


def _aes_cbc(key: bytes, data: bytes, encrypt: bool) -> bytes:
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    iv = key[:16]
    if encrypt:
        pad = 16 - len(data) % 16
        data += bytes([pad]) * pad
        c = Cipher(algorithms.AES(key), modes.CBC(iv)).encryptor()
        return base64.b64encode(c.update(data) + c.finalize())
    c = Cipher(algorithms.AES(key), modes.CBC(iv)).decryptor()
    raw = c.update(base64.b64decode(data)) + c.finalize()
    return raw[:-raw[-1]]


async def prov_savetik(url: str) -> dict[str, Any]:
    enc_url = _aes_cbc(_SAVETIK_ENC, url.encode(), True).decode()
    d = await _post_json("https://savetik.app/requests", {"bdata": enc_url},
                         {"Content-Type": "application/json",
                          "User-Agent": "Mozilla/5.0 (Android 16; Mobile; SM-D639N; rv:130.0) Gecko/130.0 Firefox/130.0"},
                         timeout=90)
    if d.get("status") != "success" or not d.get("data"):
        raise RuntimeError(f"savetik: {str(d)[:100]}")
    video_url = _aes_cbc(_SAVETIK_DEC, d["data"], False).decode()
    return {"title": d.get("vmtitle") or "video", "duration": 0.0,
            "url": video_url, "provider": "savetik"}


# ---------------------------------------------------------------------------
# 4) savetube — YouTube (AES-128, cdn dinamis)
# ---------------------------------------------------------------------------
from cryptography.hazmat.primitives.ciphers import Cipher as _C, algorithms as _A, modes as _M

_SAVETUBE_KEY = bytes.fromhex("C5D58EF67A7584E4A29F6C35BBC4EB12")


def _savetube_decrypt(b64: str) -> bytes:
    raw = base64.b64decode(b64)
    c = _C(_A.AES(_SAVETUBE_KEY), _M.CBC(raw[:16])).decryptor()
    return (c.update(raw[16:]) + c.finalize()).rstrip(b"\x00")


async def prov_savetube(url: str, quality: str = "720") -> dict[str, Any]:
    idm = re.search(r"(?:v=|embed/|shorts/|youtu\.be/)([a-zA-Z0-9_-]{11})", url)
    if not idm:
        raise RuntimeError("savetube: bukan link YouTube")
    vid = idm.group(1)
    hdrs = {"Content-Type": "application/json", "Origin": "https://yt.savetube.me", "User-Agent": UA_MOBILE}
    cdn = (await _get_json("https://media.savetube.vip/api/random-cdn", hdrs)).get("cdn")
    if not cdn:
        raise RuntimeError("savetube: tanpa cdn")
    info_resp = await _post_json(f"https://{cdn}/v2/info",
                                 {"url": f"https://www.youtube.com/watch?v={vid}"}, hdrs, timeout=90)
    dec = _savetube_decrypt(info_resp["data"])
    m = re.search(r"\{.*\}", dec.decode(errors="replace"), re.S)
    if not m:
        raise RuntimeError("savetube: decrypt gagal")
    info = json.loads(m.group(0))
    dl = await _post_json(f"https://{cdn}/download",
                          {"id": vid, "downloadType": "video", "quality": quality, "key": info["key"]},
                          hdrs, timeout=90)
    # durasi dari info decrypt (detik)
    dur = float(info.get("duration") or 0)
    if dur > 1000:
        dur = dur / 1000.0  # kalau kebetulan dalam milidetik
    return {"title": info.get("title") or "video", "duration": dur,
            "url": dl["data"]["downloadUrl"], "provider": "savetube"}


# ---------------------------------------------------------------------------
# 5) snaptwitt — X/Twitter (token + hash)
# ---------------------------------------------------------------------------
async def prov_snaptwitt(url: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        r = await client.get("https://snaptwitt.com/", headers={"User-Agent": UA_MOBILE})
        html = r.text
    token = re.search(r'name="token"\s+value="([^"]*)"', html)
    sectok = re.search(r'["\']sec_token["\']\s*:\s*["\']([^"\']+)["\']', html)
    if not token:
        raise RuntimeError("snaptwitt: tanpa token")
    token, sectok = token.group(1), sectok.group(1) if sectok else "fallback"
    salt = uuid.uuid4().hex + str(time.time())
    hashv = (base64.b64encode(url.encode()).decode() + str(len(url) + 1000)
             + base64.b64encode(salt.encode()).decode()
             + base64.b64encode(sectok.encode()).decode())
    d = await _post_form("https://snaptwitt.com/wp-json/click-dl/get-data/",
                         {"url": url, "token": token, "salt": salt, "hash": hashv},
                         {"Content-Type": "application/x-www-form-urlencoded",
                          "Origin": "https://snaptwitt.com", "Referer": "https://snaptwitt.com/",
                          "User-Agent": UA_MOBILE}, timeout=90)
    if not d.get("url"):
        raise RuntimeError(f"snaptwitt: {str(d)[:100]}")
    return {"title": d.get("title") or "video", "duration": 0.0, "url": d["url"],
            "provider": "snaptwitt"}


# ---------------------------------------------------------------------------
# 6) ssvid — IG/TikTok/YouTube
# ---------------------------------------------------------------------------
async def prov_ssvid(url: str) -> dict[str, Any]:
    d = await _post_form("https://ssvid.net/api/ajax/search?hl=en",
                         {"query": url, "cf_token": "", "vt": "home"},
                         {"Accept": "*/*", "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                          "Origin": "https://ssvid.net", "Referer": "https://ssvid.net/en-3",
                          "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36",
                          "X-Requested-With": "XMLHttpRequest"}, timeout=90)
    data = d.get("data") or d
    if isinstance(data, dict) and data.get("status") == "cookie_required":
        raise RuntimeError("ssvid: cookie_required")
    medias = []
    if isinstance(data, dict):
        medias = data.get("medias") or []
    if not medias:
        raise RuntimeError(f"ssvid: {str(data)[:100]}")
    m = _first_media(medias)
    if not m:
        raise RuntimeError("ssvid: tanpa media dengan url")
    return {"title": (isinstance(data, dict) and data.get("title")) or "video",
            "duration": 0.0,
            "url": m.get("url") or m.get("media") or m.get("download_url"),
            "provider": "ssvid"}


# ---------------------------------------------------------------------------
# 7) tweeterdownloader — X/Twitter
# ---------------------------------------------------------------------------
async def prov_tweeterdownload(url: str) -> dict[str, Any]:
    d = await _get_json(
        f"https://tweeterdownloader.com/wp-json/xvd/v1/extract?url={_urlencode(url)}",
        {"Referer": "https://tweeterdownloader.com/", "User-Agent": UA_MOBILE}, timeout=90)
    url = d.get("url") or (d.get("data") or {}).get("url")
    if not url:
        raise RuntimeError(f"tweeterdownloader: {str(d)[:100]}")
    return {"title": d.get("title") or "video", "duration": 0.0, "url": url,
            "provider": "tweeterdownloader"}


def _urlencode(s: str) -> str:
    from urllib.parse import quote
    return quote(s, safe="")


# ---------------------------------------------------------------------------
# 8) vibetik — TikTok
# ---------------------------------------------------------------------------
async def prov_vibetik(url: str) -> dict[str, Any]:
    d = await _get_json(f"https://vibetik.net/api/v2/tiktok/info?url={_urlencode(url)}",
                        {"User-Agent": UA_OKHTTP, "X-Api-Key": "vtk_m0b1l3_2026_pr0d"}, timeout=90)
    if d.get("code") != 0 or not d.get("data"):
        raise RuntimeError(f"vibetik: {str(d)[:100]}")
    data = d["data"]
    vurl = data.get("hdplay") or data.get("play") or data.get("wmplay")
    if not vurl:
        raise RuntimeError("vibetik: tanpa url video")
    return {"title": data.get("title") or "video", "duration": float(data.get("duration") or 0),
            "url": vurl, "provider": "vibetik"}


# ---------------------------------------------------------------------------
# 9) ytdl-rapidapi — YouTube
# ---------------------------------------------------------------------------
async def prov_ytdl_rapid(url: str) -> dict[str, Any]:
    idm = re.search(r"(?:v=|embed/|shorts/|youtu\.be/)([a-zA-Z0-9_-]{11})", url)
    if not idm:
        raise RuntimeError("ytdl-rapid: bukan link YouTube")
    vid = idm.group(1)
    d = await _get_json(f"https://ytstream-download-youtube-videos.p.rapidapi.com/dl?id={vid}",
                        {"X-RapidAPI-Host": "ytstream-download-youtube-videos.p.rapidapi.com",
                         "X-RapidAPI-Key": RAPID_YTSTREAM_KEY}, timeout=90)
    if d.get("status") != "OK":
        raise RuntimeError(f"ytdl-rapid: {str(d)[:100]}")
    fmts = d.get("formats") or []
    if not fmts:
        raise RuntimeError("ytdl-rapid: tanpa format")
    m = _first_media(fmts)
    return {"title": d.get("title") or "video", "duration": float(d.get("lengthSeconds") or 0),
            "url": m.get("url") or m.get("media"), "provider": "ytdl-rapidapi"}


# ---------------------------------------------------------------------------
# 10) ytscribeto — X/Twitter (Elementor form)
# ---------------------------------------------------------------------------
async def prov_ytscribeto(url: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        r = await client.get("https://ytscribeto.com/pl/twdownloader/",
                             headers={"User-Agent": UA_MOBILE})
        html = r.text
        cookies = "; ".join(f"{k}={v}" for k, v in r.cookies.items()) + "; hc_js_gate=1"

    def grab(name: str) -> str:
        m = re.search(r'name="%s"\s+value="([^"]*)"' % re.escape(name), html)
        return m.group(1) if m else ""

    post_id, form_id = grab("post_id"), grab("form_id")
    rt, qid = grab("referer_title"), grab("queried_id")
    if not post_id:
        raise RuntimeError("ytscribeto: tanpa form")
    data = {"post_id": post_id, "form_id": form_id, "referer_title": rt, "queried_id": qid,
            "form_fields[url]": url, "trp-form-language": "pl",
            "action": "elementor_pro_forms_send_form",
            "referrer": "https://ytscribeto.com/pl/twdownloader/"}
    async with httpx.AsyncClient(timeout=90, follow_redirects=True) as client:
        r = await client.post("https://ytscribeto.com/wp-admin/admin-ajax.php", data=data,
                              headers={"Content-Type": "application/x-www-form-urlencoded",
                                       "Origin": "https://ytscribeto.com",
                                       "Referer": "https://ytscribeto.com/pl/twdownloader/",
                                       "User-Agent": UA_MOBILE,
                                       "X-Requested-With": "XMLHttpRequest",
                                       "Cookie": cookies})
        d = r.json()
    if not d.get("success"):
        raise RuntimeError(f"ytscribeto: {str(d)[:100]}")
    result = d["data"]["data"]["result"]
    medias = result.get("medias") or []
    m = _first_media(medias)
    if not m:
        raise RuntimeError("ytscribeto: tanpa media")
    return {"title": result.get("title") or "video", "duration": 0.0,
            "url": m.get("media") or m.get("url"), "provider": "ytscribeto"}


# ---------------------------------------------------------------------------
# Registri terkurasi per-platform (failover otomatis sesuai urutan)
# ---------------------------------------------------------------------------
PROVIDERS_YOUTUBE = [prov_savetube, prov_ytdl_rapid, prov_aio, prov_densave, prov_ssvid]
PROVIDERS_TWITTER = [prov_densave, prov_aio, prov_snaptwitt, prov_tweeterdownload, prov_ytscribeto]
PROVIDERS_TIKTOK = [prov_vibetik, prov_savetik, prov_aio, prov_ssvid]
PROVIDERS_INSTAGRAM = [prov_aio, prov_ssvid]


def detect_platform(url: str) -> str:
    low = url.lower()
    if "youtube.com" in low or "youtu.be" in low:
        return "youtube"
    if "twitter.com" in low or "x.com" in low:
        return "twitter"
    if "tiktok.com" in low:
        return "tiktok"
    if "instagram.com" in low:
        return "instagram"
    raise RuntimeError("platform tidak didukung (youtube/twitter/tiktok/instagram saja)")


async def hydra_any(url: str) -> dict[str, Any]:
    """Coba SEMUA provider untuk platform ybs sampai satu sukses mengembalikan URL media."""
    platform = detect_platform(url)
    table = {
        "youtube": PROVIDERS_YOUTUBE,
        "twitter": PROVIDERS_TWITTER,
        "tiktok": PROVIDERS_TIKTOK,
        "instagram": PROVIDERS_INSTAGRAM,
    }
    errors: list[str] = []
    for prov in table[platform]:
        name = prov.__name__.replace("prov_", "")
        try:
            info = await prov(url)
            if info.get("url"):
                print(f"[hydra-any] {name} OK -> {str(info['url'])[:80]}")
                return info
            errors.append(f"{name}: tanpa url")
        except Exception as exc:
            errors.append(f"{name}: {str(exc)[:100]}")
            print(f"[hydra-any] {name} gagal: {str(exc)[:120]}")
            continue
    raise RuntimeError("Semua provider gagal: " + " | ".join(errors))