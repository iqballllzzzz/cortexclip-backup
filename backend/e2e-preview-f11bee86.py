"""E2E NYATA: preview klip proyek f11bee86 yang tadi gagal harus MUNCUL.
Rute sumber: projects.storage_path (bukan YouTube). Lulus hanya kalau
preview_url terisi + berkasnya bisa diunduh.
"""
import asyncio
import os
import sys
import time

sys.path.insert(0, "/home/muhiqbalsukarno/cortexclip-backup/backend")
os.chdir("/home/muhiqbalsukarno/cortexclip-backup/backend")
from dotenv import load_dotenv

load_dotenv(".env")
import httpx

SB = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_KEY"]
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}",
     "Content-Type": "application/json"}
PROYEK = "f11bee86-a317-4e72-8402-e04a5346005b"


async def main():
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.get(
            f"{SB}/rest/v1/clips?project_id=eq.{PROYEK}"
            "&select=id,title,start_time,end_time,preview_url,preview_ready"
            "&order=start_time.asc&limit=3", headers=H)
        klips = r.json()
        if not klips:
            print("GAGAL: tidak ada klip")
            return 1
        k = klips[0]
        cid = k["id"]
        print(f"klip uji   : {cid[:8]} — {str(k.get('title'))[:40]}")
        print(f"durasi     : {k['start_time']:.0f}s → {k['end_time']:.0f}s")

        # paksa render ulang
        await c.patch(f"{SB}/rest/v1/clips?id=eq.{cid}", headers=H,
                      json={"preview_url": None, "preview_ready": False})

        from app.render_clip import render_preview_clip
        from app.preview_progress import get_progress

        t0 = time.time()
        try:
            hasil = await render_preview_clip(PROYEK, cid, token=KEY,
                                              caption_style=None)
        except Exception as exc:
            print(f"GAGAL: {type(exc).__name__}: {str(exc)[:200]}")
            return 1
        dur = time.time() - t0
        print(f"selesai    : {dur:.0f}s, usang={hasil.get('usang')}")

        r2 = await c.get(f"{SB}/rest/v1/clips?id=eq.{cid}"
                         "&select=preview_url,preview_ready", headers=H)
        row = (r2.json() or [{}])[0]
        url = row.get("preview_url")
        print(f"preview    : ready={row.get('preview_ready')} url={'ADA' if url else 'TIDAK ADA'}")
        if not url or not row.get("preview_ready"):
            return 1
        hr = await c.get(url, follow_redirects=True)
        print(f"unduh      : HTTP {hr.status_code}, {len(hr.content)/1024:.0f} KB")
        if hr.status_code == 200 and len(hr.content) > 20000:
            print(f"✅ LULUS — preview {cid[:8]} muncul ({dur:.0f}s), sumber dari storage")
            return 0
        return 1


sys.exit(asyncio.run(main()))
