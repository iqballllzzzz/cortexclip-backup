"""CUSTOM LOGO (PREMIUM) — logo brand pengguna di klip.

Alur:
1. UI: tombol "Add Custom Logo" → pilih gambar (PNG/JPG).
2. UI: tombol "Hapus background" → POST /api/logo/removebg
   → coba https://api.nexray.eu.cc/tools/v1/removebg, GAGAL → v2
   (failover eksplisit sesuai permintaan pengguna).
3. UI: "Setuju" → POST /api/logo/{clip_id} {url, cx, cy, scale}
   → disimpan ke clips.camera_track.logo (JSONB) → preview reset.
4. Render (preview + unduhan): overlay PNG di posisi cx,cy dengan skala.

Fitur KHUSUS PREMIUM — endpoint menolak akun free (mirror paywall
watermark: premium boleh menghapus watermark, jadi bebas pasang logo).
"""
from __future__ import annotations

import os
import tempfile
from typing import Any, Optional

import httpx

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
PUBLIC_SUPABASE_URL = os.getenv("PUBLIC_SUPABASE_URL",
                                SUPABASE_URL).rstrip("/")
BUCKET = "video-uploads"

REMOVEBG_V1 = "https://api.nexray.eu.cc/tools/v1/removebg"
REMOVEBG_V2 = "https://api.nexray.eu.cc/tools/v2/removebg"

# UA mobile persis resep pengguna (catbox.moe menolak client non-browser)
UA_CATBOX = ("Mozilla/5.0 (Linux; Android 15; SM-F958 Build/AP3A.240905.015) "
             "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.86 "
             "Mobile Safari/537.36")

# batas wajar (sama dengan upload video: 25 MB)
MAX_BYTES = 25 * 1024 * 1024


def _headers() -> dict[str, str]:
    return {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "application/json"}


async def _sb(method: str, path: str, **kw) -> Any:
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.request(method, f"{SUPABASE_URL}/rest/v1/{path}",
                            headers=_headers(), **kw)
    if r.status_code >= 302:
        raise RuntimeError(f"supabase {r.status_code}: {r.text[:200]}")
    try:
        return r.json()
    except Exception:
        return None


async def premium_aktif(user_id: str) -> bool:
    """Cek status premium lewat modul premium (satu sumber kebenaran)."""
    from .premium import is_premium
    return bool(await is_premium(user_id))


async def _unggah_catbox(content: bytes) -> str:
    """Ubah bytes gambar → URL publik (catbox.moe).

    API removebg nexray hanya menerima IMAGE URL, jadi gambar dari user
    harus di-host dulu. Implementasi persis resep pengguna (catbox.moe
    user/api.php, form multipart + cookie sesi + UA mobile).
    """
    import uuid as _uuid

    # multipart manual (httpx tidak bawa form-data builder berkas)
    batas = f"----cc{_uuid.uuid4().hex[:16]}"
    nama = f"{int(__import__('time').time())}_cc.png"
    bagian: list[bytes] = []
    for k, v in (("userhash", ""), ("reqtype", "fileupload")):
        bagian.append(
            f"--{batas}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode())
    bagian.append(
        f"--{batas}\r\nContent-Disposition: form-data; name=\"fileToUpload\"; "
        f"filename=\"{nama}\"\r\nContent-Type: image/png\r\n\r\n".encode())
    bagian.append(content)
    bagian.append(f"\r\n--{batas}--\r\n".encode())
    body = b"".join(bagian)

    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as c:
        # sesi: ambil cookie dulu (resep pengguna)
        await c.get("https://catbox.moe/",
                    headers={"user-agent": UA_CATBOX})
        r = await c.post(
            "https://catbox.moe/user/api.php",
            content=body,
            headers={
                "Content-Type": f"multipart/form-data; boundary={batas}",
                "origin": "https://catbox.moe",
                "referer": "https://catbox.moe/",
                "user-agent": UA_CATBOX,
                "x-requested-with": "XMLHttpRequest",
            })
    url = (r.text or "").strip()
    if r.status_code != 200 or not url.startswith("http"):
        raise RuntimeError(f"catbox gagal ({r.status_code}): {r.text[:120]}")
    return url


async def removebg(content: bytes, apikey: str) -> tuple[bytes, str]:
    """Hapus background: v1 → gagal → v2 (failover berantai eksplisit).

    API nexray menerima IMAGE URL (bukan upload) → gambar di-host dulu di
    catbox.moe (resep pengguna), lalu URL dikirim sebagai image_url.
    Balik (bytes PNG hasil, versi yang sukses).
    """
    url_gambar = await _unggah_catbox(content)
    kesalahan: list[str] = []
    for versi, url in (("v1", REMOVEBG_V1), ("v2", REMOVEBG_V2)):
        try:
            async with httpx.AsyncClient(timeout=120) as c:
                r = await c.post(
                    url,
                    headers={"Authorization": f"Bearer {apikey}"} if apikey else {},
                    json={"image_url": url_gambar},
                )
            if r.status_code == 200:
                # bisa berupa biner PNG langsung atau JSON berisi url/bytes
                ct = r.headers.get("content-type", "")
                if "image" in ct and len(r.content) > 1000:
                    return r.content, versi
                try:
                    d = r.json()
                    u = d.get("image_url") or d.get("url") or d.get("result")
                    if isinstance(u, str) and u.startswith("http"):
                        async with httpx.AsyncClient(timeout=60) as c2:
                            g = await c2.get(u)
                        if g.status_code == 200 and len(g.content) > 1000:
                            return g.content, versi
                    b64 = d.get("image") or d.get("b64") or d.get("data")
                    if isinstance(b64, str) and len(b64) > 100:
                        import base64 as _b64
                        return _b64.b64decode(b64), versi
                except ValueError:
                    pass
            kesalahan.append(f"{versi}:{r.status_code} {r.text[:80]}")
        except Exception as exc:
            kesalahan.append(f"{versi}:{exc.__class__.__name__}")
    raise RuntimeError("removebg v1 & v2 gagal — " + "; ".join(kesalahan))


async def simpan_logo(clip_id: str, user_id: str,
                      png_bytes: bytes) -> str:
    """Simpan PNG logo ke storage → balik URL publik."""
    path = f"{user_id}/logos/{clip_id}.png"
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{path}"
    async with httpx.AsyncClient(timeout=120) as c:
        r = await c.post(
            url,
            headers={**_headers(),
                     "Content-Type": "image/png", "x-upsert": "true"},
            content=png_bytes)
    if r.status_code not in (200, 201):
        raise RuntimeError(f"upload logo gagal ({r.status_code}) {r.text[:150]}")
    return (f"{PUBLIC_SUPABASE_URL}/storage/v1/object/public/"
            f"{BUCKET}/{path}")


async def set_logo_klip(clip_id: str, user_id: str,
                        logo_url: str, cx: float, cy: float,
                        scale: float) -> dict[str, Any]:
    """Simpan posisi/skala logo milik klip (clips.camera_track.logo)."""
    rows = await _sb("GET", f"clips?id=eq.{clip_id}"
                            "&select=id,user_id,camera_track")
    if not rows or str(rows[0].get("user_id")) != str(user_id):
        raise RuntimeError("klip tidak ditemukan")
    ct = rows[0].get("camera_track") or {}
    if isinstance(ct, str):
        import json as _json
        try:
            ct = _json.loads(ct)
        except ValueError:
            ct = {}
    ct["logo"] = {
        "url": str(logo_url),
        "cx": max(0.0, min(1.0, float(cx))),
        "cy": max(0.0, min(1.0, float(cy))),
        "scale": max(0.05, min(1.0, float(scale))),
    }
    # framing/overlay berubah → preview lama basi
    await _sb("PATCH", f"clips?id=eq.{clip_id}",
              json={"camera_track": ct,
                    "preview_url": None, "preview_ready": False})
    # berkas preview lama tidak lagi mewakili hasil dengan logo → hapus
    try:
        from .render_clip import hapus_preview_cache
        await hapus_preview_cache(clip_id, user_id)
    except Exception as exc:
        print(f"[logo] hapus cache preview gagal (lanjut): {exc}")
    try:
        from .background import _berkunci
        from .preview_progress import clear_progress
        tugas = _berkunci.get(f"preview:{clip_id}")
        if tugas is not None and not tugas.done():
            tugas.cancel()
        clear_progress(clip_id)
    except Exception as exc:
        print(f"[logo] gagal membatalkan task preview: {exc}")
    return {"ok": True, "logo": ct["logo"]}


async def hapus_logo(clip_id: str, user_id: str) -> dict[str, Any]:
    """Hapus logo dari klip (kembali tanpa logo)."""
    rows = await _sb("GET", f"clips?id=eq.{clip_id}"
                            "&select=id,user_id,camera_track")
    if not rows or str(rows[0].get("user_id")) != str(user_id):
        raise RuntimeError("klip tidak ditemukan")
    ct = rows[0].get("camera_track") or {}
    if isinstance(ct, str):
        import json as _json
        try:
            ct = _json.loads(ct)
        except ValueError:
            ct = {}
    ct.pop("logo", None)
    await _sb("PATCH", f"clips?id=eq.{clip_id}",
              json={"camera_track": ct,
                    "preview_url": None, "preview_ready": False})
    return {"ok": True}


async def unduh_lokal(url: str) -> str:
    """Unduh logo ke file lokal (untuk render ffmpeg overlay)."""
    fd, path = tempfile.mkstemp(prefix="cc_logo_", suffix=".png")
    os.close(fd)
    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as c:
        r = await c.get(url)
    if r.status_code != 200:
        os.unlink(path)
        raise RuntimeError(f"unduh logo gagal ({r.status_code})")
    with open(path, "wb") as f:
        f.write(r.content)
    return path
