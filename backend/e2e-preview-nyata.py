"""E2E NYATA: render preview klip yang tadi GAGAL (exit 234), sampai muncul.

Klip yang gagal di log produksi: 38e04489-7ce5-406c-b494-bd63f7a6245b dan
64dbc64c-fd51-49bc-82e4-903328554c80. Uji ini menjalankan jalur render yang
sebenarnya (render_preview_clip) dan menyatakan LULUS hanya kalau preview_url
benar-benar terisi dan berkasnya bisa diunduh.
"""
import asyncio
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

import httpx  # noqa: E402

SB = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_KEY"]
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}",
     "Content-Type": "application/json"}

KANDIDAT = [
    "38e04489-7ce5-406c-b494-bd63f7a6245b",
    "64dbc64c-fd51-49bc-82e4-903328554c80",
]


async def main():
    async with httpx.AsyncClient(timeout=60) as c:
        for cid in KANDIDAT:
            r = await c.get(
                f"{SB}/rest/v1/clips?id=eq.{cid}"
                "&select=id,project_id,user_id,start_time,end_time,"
                "layout_prefs,preview_url,preview_ready",
                headers=H)
            rows = r.json() if r.status_code == 200 else []
            if not rows:
                print(f"  klip {cid[:8]} tidak ada di DB")
                continue
            k = rows[0]
            prefs = k.get("layout_prefs") or {}
            print(f"\n=== KLIP {cid[:8]} ===")
            print(f"  proyek       : {str(k.get('project_id'))[:8]}")
            print(f"  auto split   : {bool(prefs.get('enabled'))}")
            print(f"  durasi       : {k.get('start_time')} → {k.get('end_time')}")
            print(f"  preview lama : {'ADA' if k.get('preview_url') else 'TIDAK ADA'}")

            # paksa render ulang dari nol
            await c.patch(f"{SB}/rest/v1/clips?id=eq.{cid}", headers=H,
                          json={"preview_url": None, "preview_ready": False})

            from app.render_clip import render_preview_clip
            from app.preview_progress import get_progress

            t0 = time.time()
            tugas = asyncio.create_task(render_preview_clip(
                str(k["project_id"]), cid, token=KEY, caption_style=None))

            terlihat = []
            while not tugas.done():
                await asyncio.sleep(3)
                p = get_progress(cid)
                if p:
                    terlihat.append(p["pct"])
                if time.time() - t0 > 600:
                    tugas.cancel()
                    break
            try:
                hasil = await tugas
            except asyncio.CancelledError:
                print("  GAGAL: melebihi 600 detik")
                return 1
            except Exception as exc:
                print(f"  GAGAL: {type(exc).__name__}: {str(exc)[:200]}")
                return 1

            dur = time.time() - t0
            print(f"  selesai      : {dur:.0f} detik")
            print(f"  progres      : {terlihat}")
            naik = all(b >= a for a, b in zip(terlihat, terlihat[1:]))
            print(f"  monoton naik : {naik}")

            r2 = await c.get(f"{SB}/rest/v1/clips?id=eq.{cid}"
                             "&select=preview_url,preview_ready", headers=H)
            row = (r2.json() or [{}])[0]
            url = row.get("preview_url")
            print(f"  preview_ready: {row.get('preview_ready')}")
            print(f"  preview_url  : {'ADA' if url else 'TIDAK ADA'}")
            if not url or not row.get("preview_ready"):
                print("  GAGAL: preview tidak terisi")
                return 1

            hr = await c.get(url, follow_redirects=True)
            n = len(hr.content)
            print(f"  unduh berkas : HTTP {hr.status_code}, {n} byte")
            if hr.status_code != 200 or n < 20000:
                print("  GAGAL: berkas preview tidak sah")
                return 1
            print(f"  ✅ LULUS — preview {cid[:8]} muncul, {n/1024:.0f} KB, "
                  f"{dur:.0f}s, progres monoton={naik}")
            if hasil.get("usang"):
                print("  (catatan: hasil ditandai usang)")
    return 0


sys.exit(asyncio.run(main()))
