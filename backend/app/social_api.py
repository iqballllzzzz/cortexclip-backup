"""Endpoint SOCIAL AUTO PUBLISHING — didaftarkan dari main.py.

Dipisah supaya main.py tidak membengkak, pola yang sama dengan broll_api.py.
"""
from __future__ import annotations

from typing import Any, Optional

from fastapi import Header, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel


class ConnectIn(BaseModel):
    platform: str
    profile_name: str
    login_method: Optional[str] = None


class ScheduleIn(BaseModel):
    account_ids: list[str]
    clip_ids: list[str]
    hours: Optional[list[int]] = None


def _halaman_tutup(judul: str, pesan: str, ok: bool) -> HTMLResponse:
    """Halaman kecil untuk tab OAuth: memberi tahu hasil lalu menutup diri.

    Dibuat sebagai HTML polos (bukan redirect ke SPA) supaya pengguna melihat
    hasilnya walau tab dibuka di browser lain / mode privat, dan supaya
    halaman utama bisa memuat ulang daftar akunnya sendiri.
    """
    warna = "#16a34a" if ok else "#dc2626"
    return HTMLResponse(f"""<!doctype html><html lang="id"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{judul}</title>
<style>
  :root {{ color-scheme: light dark; }}
  body {{ margin:0; min-height:100vh; display:grid; place-items:center;
         font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;
         background:#0f1115; color:#f4f4f5; padding:24px; }}
  .kotak {{ max-width:420px; text-align:center; }}
  h1 {{ font-size:20px; margin:0 0 10px; color:{warna}; }}
  p {{ margin:0 0 18px; color:#a1a1aa; }}
  button {{ font:inherit; padding:10px 18px; border-radius:10px; border:0;
           background:#f4f4f5; color:#0f1115; font-weight:600; cursor:pointer; }}
</style></head><body><div class="kotak">
<h1>{judul}</h1><p>{pesan}</p>
<button onclick="tutup()">Tutup jendela ini</button>
<script>
  try {{ if (window.opener) window.opener.postMessage(
        {{ type: "cortexclip:social", ok: {str(ok).lower()} }}, "*"); }} catch (e) {{}}
  function tutup() {{ window.close(); location.href = "/social"; }}
  setTimeout(tutup, 2600);
</script></div></body></html>""")


def register_social_routes(app, get_user) -> None:
    """Daftarkan endpoint auto-publish. `get_user` diambil dari main.py."""

    @app.get("/api/social/platforms")
    async def api_social_platforms():
        """Platform mana yang siap dipakai (kredensial OAuth ada di server)."""
        from .social_publish import status_platform
        return status_platform()

    @app.get("/api/social/list")
    async def api_social_list(request: Request,
                              authorization: Optional[str] = Header(None)):
        user = await get_user(request, authorization)
        from .social_schedule import daftar
        try:
            return await daftar(str(user["id"]))
        except Exception as exc:
            raise HTTPException(400, str(exc)[:200])

    @app.post("/api/social/connect")
    async def api_social_connect(body: ConnectIn, request: Request,
                                 authorization: Optional[str] = Header(None)):
        """Mulai OAuth: balikin auth_url yang harus dibuka pengguna."""
        user = await get_user(request, authorization)
        from .social_publish import mulai_koneksi
        try:
            return await mulai_koneksi(str(user["id"]), body.platform,
                                       body.profile_name, body.login_method)
        except PermissionError as exc:
            # kredensial belum diatur admin — JUJUR, bukan diam-diam gagal
            raise HTTPException(503, str(exc)[:300])
        except ValueError as exc:
            raise HTTPException(400, str(exc)[:200])
        except Exception as exc:
            raise HTTPException(500, str(exc)[:200])

    @app.get("/api/social/callback/{platform}")
    async def api_social_callback(platform: str, request: Request):
        """Callback OAuth. TIDAK butuh header Authorization (browser redirect);
        keamanannya dari `state` acak yang mengikat baris pending."""
        code = request.query_params.get("code")
        state = request.query_params.get("state")
        err = request.query_params.get("error")
        if err:
            return _halaman_tutup("Koneksi dibatalkan",
                                  f"Platform menolak: {err}", False)
        if not code or not state:
            return _halaman_tutup("Koneksi gagal",
                                  "Callback tanpa code/state.", False)
        from .social_publish import selesaikan_koneksi
        try:
            hasil = await selesaikan_koneksi(platform, code, state)
            acc = hasil.get("account") or {}
            nama = acc.get("account_name") or acc.get("profile_name") or "akun"
            if hasil.get("nama_cocok"):
                return _halaman_tutup("Akun tersambung",
                                      f"{nama} siap dipakai auto-publish.", True)
            return _halaman_tutup(
                "Tersambung (periksa akun)",
                f"Tersambung sebagai {nama} — berbeda dari nama yang kamu tulis. "
                "Kalau salah akun, putuskan lalu sambungkan ulang.", True)
        except Exception as exc:
            return _halaman_tutup("Koneksi gagal", str(exc)[:200], False)

    @app.delete("/api/social/accounts/{account_id}")
    async def api_social_disconnect(account_id: str, request: Request,
                                    authorization: Optional[str] = Header(None)):
        user = await get_user(request, authorization)
        from .social_schedule import putuskan
        try:
            return await putuskan(str(user["id"]), account_id)
        except ValueError as exc:
            raise HTTPException(404, str(exc)[:200])
        except Exception as exc:
            raise HTTPException(400, str(exc)[:200])

    @app.get("/api/social/clips")
    async def api_social_clips(request: Request,
                               authorization: Optional[str] = Header(None)):
        """Proyek + klip milik pengguna, untuk layar 'pilih proyek'."""
        user = await get_user(request, authorization)
        from .social_publish import _sb
        try:
            proyek = await _sb("GET", "projects?select=id,title,status,created_at"
                                      f"&user_id=eq.{user['id']}"
                                      "&order=created_at.desc&limit=60")
            ids = [str(p["id"]) for p in (proyek or [])]
            klip: list[dict[str, Any]] = []
            if ids:
                klip = await _sb("GET", "clips?select=id,project_id,title,"
                                        "start_time,end_time,rendered_url"
                                        "&project_id=in.(" + ",".join(ids) + ")"
                                        "&order=start_time.asc&limit=400") or []
            return {"projects": proyek or [], "clips": klip}
        except Exception as exc:
            raise HTTPException(400, str(exc)[:200])

    @app.post("/api/social/schedule")
    async def api_social_schedule(body: ScheduleIn, request: Request,
                                  authorization: Optional[str] = Header(None)):
        user = await get_user(request, authorization)
        from .social_schedule import jadwalkan_klip
        try:
            return await jadwalkan_klip(str(user["id"]), body.account_ids,
                                        body.clip_ids, body.hours)
        except ValueError as exc:
            raise HTTPException(400, str(exc)[:250])
        except Exception as exc:
            raise HTTPException(500, str(exc)[:250])

    @app.post("/api/social/jobs/{job_id}/cancel")
    async def api_social_cancel(job_id: str, request: Request,
                                authorization: Optional[str] = Header(None)):
        user = await get_user(request, authorization)
        from .social_schedule import batalkan
        try:
            return await batalkan(str(user["id"]), job_id)
        except ValueError as exc:
            raise HTTPException(400, str(exc)[:200])
        except Exception as exc:
            raise HTTPException(500, str(exc)[:200])
