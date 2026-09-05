"""API AUTO SPLIT: simpan satu toggle & pratinjau rentang split.

Dua endpoint:
  PUT  /api/layout-prefs/{clip_id}   simpan {"enabled":bool}
                                     → INVALIDASI preview supaya dirender ulang
  GET  /api/layout-plan/{clip_id}    rentang split (untuk ditampilkan di editor)

Kenapa menyimpan pilihan MEMBATALKAN preview: split ikut dibakar ke berkas
preview (supaya preview == unduhan). Kalau preview lama dibiarkan, pengguna
menyalakan Auto Split tapi videonya tidak berubah sampai render berikutnya —
bug yang sudah pernah terjadi dengan cache preview.

PIVOT (openshorts): tidak ada lagi 7 pilihan layout (fill/fit/split/three/
four/gameplay/screenshare). Terukur, pilihan itu tidak pernah menghasilkan
apa pun: hanya 3% frame punya >=2 wajah dan syarat rentang berurutan
memutus semuanya. Sekarang SATU keputusan — split saat dua orang benar-benar
bergiliran bicara, kamera saja di sisanya. `layouts` masih diterima di body
untuk kompatibilitas klien lama, tapi diabaikan.
"""
from __future__ import annotations

import os
from typing import Any, Optional

import httpx

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")


def _headers() -> dict[str, str]:
    return {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "application/json"}


async def _sb(method: str, path: str, **kw) -> Any:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.request(method, f"{SUPABASE_URL}/rest/v1/{path}",
                            headers={**_headers(), "Prefer": "return=representation"},
                            **kw)
        if r.status_code >= 300:
            raise RuntimeError(f"supabase {r.status_code}: {r.text[:200]}")
        try:
            return r.json()
        except Exception:
            return None


def bersihkan_prefs(body: dict[str, Any]) -> dict[str, Any]:
    """Validasi masukan pengguna — kini hanya SATU keputusan: enabled.

    `layouts` dari klien lama diabaikan (auto split tidak punya pilihan tata
    letak). Disimpan sebagai [] supaya baris lama di database ikut bersih dan
    perbandingan "berubah" di simpan_prefs tidak pernah salah karena sisa
    pilihan lama.

    Nilai ini SELALU milik satu clip_id (lihat simpan_prefs) — tidak ada jalur
    yang menulis layout_prefs untuk seluruh proyek.
    """
    return {
        "enabled": bool(body.get("enabled")),
        "layouts": [],
    }


async def simpan_prefs(clip_id: str, user_id: str,
                       body: dict[str, Any]) -> dict[str, Any]:
    """Simpan layout_prefs milik klip ini + batalkan preview lama."""
    rows = await _sb("GET", f"clips?id=eq.{clip_id}&select=id,user_id,layout_prefs")
    if not rows:
        raise RuntimeError("klip tidak ditemukan")
    if str(rows[0].get("user_id")) != str(user_id):
        raise RuntimeError("bukan milik pengguna ini")

    prefs = bersihkan_prefs(body)
    lama = rows[0].get("layout_prefs") or {}
    # Bawaan MATI (lihat render_clip._auto_split_aktif), jadi bool() apa adanya
    # sudah benar: klip tanpa prefs = mati, dan menyalakannya = berubah.
    berubah = bool(lama.get("enabled")) != prefs["enabled"]

    patch: dict[str, Any] = {"layout_prefs": prefs}
    if berubah:
        # preview lama memakai layout lama → harus dibuat ulang
        patch.update({"preview_url": None, "preview_ready": False})
    await _sb("PATCH", f"clips?id=eq.{clip_id}", json=patch)

    if berubah:
        # ===== BATALKAN TASK RENDER YANG MASIH JALAN =====
        # Keluhan pengguna: "matiin terus nyalain lagi auto split, udah 50
        # persen, tiba-tiba balik lagi ke 5 persen." Sebabnya: PUT lama hanya
        # mengosongkan preview di DB, tapi task render LAMA tetap jalan dan
        # tetap melapor progress. Task baru TIDAK boleh mulai (key masih
        # dipegang task lama), jadi UI bergoyang antara progress task lama
        # (50%) dan task baru (5%) — dan hasil akhirnya bisa SALAH LAYOUT.
        # Sekarang task lama dibatalkan + progressnya dihapus, lalu klien
        # (yang mem-poll) otomatis memicu render baru yang benar.
        try:
            from .background import _berkunci
            from .preview_progress import clear_progress

            tugas = _berkunci.get(f"preview:{clip_id}")
            if tugas is not None and not tugas.done():
                tugas.cancel()
                print(f"[layout] task preview {clip_id[:8]} dibatalkan "
                      "(layout berubah)")
            clear_progress(clip_id)
        except Exception as exc:
            print(f"[layout] gagal membatalkan task preview (lanjut): {exc}")

    return {"ok": True, "layout_prefs": prefs, "preview_direset": berubah}


async def rencana(clip_id: str, user_id: str, *, render_mod,
                  source_url_for) -> dict[str, Any]:
    """Rentang AUTO SPLIT untuk klip ini (tanpa merender).

    Memakai camera_track kalau sudah ada supaya tidak menganalisis dua kali.
    Bentuk balikan tetap {"segments": [...]} agar editor lama tidak pecah;
    setiap segmen kini {start, end, layout:"split"}.
    """
    rows = await _sb(
        "GET",
        f"clips?id=eq.{clip_id}"
        "&select=id,user_id,project_id,start_time,end_time,layout_prefs,camera_track")
    if not rows:
        raise RuntimeError("klip tidak ditemukan")
    clip = rows[0]
    if str(clip.get("user_id")) != str(user_id):
        raise RuntimeError("bukan milik pengguna ini")

    ct = clip.get("camera_track") or {}
    # rentang yang SUDAH dipakai render — sumber kebenaran, jadi apa yang
    # dilihat pengguna di daftar = apa yang ada di videonya.
    tersimpan = ct.get("auto_splits")
    if tersimpan:
        seg = [{"start": float(s["start"]), "end": float(s["end"]),
                "layout": "split"} for s in tersimpan]
        return {"segments": seg,
                "ringkas": {"split": round(sum(s["end"] - s["start"] for s in seg), 1)},
                "layout_prefs": clip.get("layout_prefs") or {}}

    st: dict[str, Any] = dict(ct)
    frames = ct.get("layout_frames") or []
    if not frames:
        proj = await _sb("GET", f"projects?id=eq.{clip['project_id']}"
                                "&select=id,storage_path,user_id")
        if not proj:
            raise RuntimeError("proyek tidak ditemukan")
        url = await source_url_for(proj[0])
        if not url:
            raise RuntimeError("sumber video tidak tersedia")
        st = render_mod.analyze_speaker_track(
            url, float(clip["start_time"]), float(clip["end_time"]))
        # simpan supaya panggilan berikutnya instan
        try:
            await _sb("PATCH", f"clips?id=eq.{clip_id}",
                      json={"camera_track": {**(ct or {}), **st}})
        except Exception as exc:
            print(f"[split] simpan camera_track gagal (lanjut): {exc}")

    from . import auto_split
    r = auto_split.rencana_auto_split(st, src_w=int(st.get("src_w") or 0))
    seg = [{"start": float(s["start"]), "end": float(s["end"]),
            "layout": "split"} for s in (r.get("splits") or [])]
    return {"segments": seg,
            "ringkas": {"split": round(sum(s["end"] - s["start"] for s in seg), 1)},
            "layout_prefs": clip.get("layout_prefs") or {}}
