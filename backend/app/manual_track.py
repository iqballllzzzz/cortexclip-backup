"""MANUAL TRACKING — pengguna klik subjek, kamera mengikutinya.

Alur (mirror OpusClip "AI-Assisted Identification" + "Smooth Object
Tracking", versi yang bisa diuji di server ini tanpa model tambahan):

1. UI menampilkan video SUMBER 16:9 (belum dipotong 9:16) lewat HTTP-seek.
2. Pengguna KLIK satu titik pada subjek (manusia/benda) — koordinat
   dinormalisasi terhadap frame sumber (0..1).
3. Backend mencari entri `layout_frames` (hasil analisis wajah yang SUDAH
   tersimpan di clips.camera_track) dan memilih wajah yang PALING DEKAT
   dengan titik klik pada frame terdekat — itu "subjek terpilih".
4. Untuk seluruh rentang scene (scene_start..scene_end), kamera mengikuti
   posisi subjek terpilih per frame (data cx,cy wajah) → trajektori px.
5. Disimpan ke clips.camera_track.manual = {scenes: [{start,end,x,fps}]}
   + preview direset supaya dirender ulang.

Kenapa memakai layout_frames: analisis wajah penuh (44 detik untuk klip
61 detik) JUGA menghasilkan layout_frames, dan menyimpannya sudah kebiasaan
pipeline (_cam_track_dari). Manual tracking cuma perlu MEMILIH wajah —
bukan menganalisis ulang. Bila layout_frames kosong, analisis penuh
dijalankan sekali lalu dilanjutkan.
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
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.request(method, f"{SUPABASE_URL}/rest/v1/{path}",
                            headers={**_headers(),
                                     "Prefer": "return=representation"},
                            **kw)
    if r.status_code >= 300:
        raise RuntimeError(f"supabase {r.status_code}: {r.text[:200]}")
    try:
        return r.json()
    except Exception:
        return None


async def muat_klip(clip_id: str) -> dict[str, Any]:
    rows = await _sb(
        "GET",
        f"clips?id=eq.{clip_id}"
        "&select=id,user_id,project_id,start_time,end_time,camera_track,layout_prefs")
    if not rows:
        raise RuntimeError("klip tidak ditemukan")
    return rows[0]


def _pilih_subjek(frames: list[dict[str, Any]], klik: tuple[float, float],
                 fps: float, scene_start: float) -> tuple[int, int]:
    """Wajah terdekat dari titik klik (jendela ±2s dari awal scene).

    Balik (indeks_frame, indeks_wajah); (-1,-1) kalau tidak ada deteksi.
    """
    if not frames:
        return -1, -1
    idx0 = max(0, min(len(frames) - 1, int(round(scene_start * fps))))
    best_f, best_w, best_d = -1, -1, 1e9
    for fi in range(max(0, idx0 - int(2 * fps)),
                    min(len(frames), idx0 + int(2 * fps) + 1)):
        faces = frames[fi].get("faces") or []
        for wi, f in enumerate(faces):
            d = ((float(f.get("cx", .5)) - klik[0]) ** 2
                 + (float(f.get("cy", .5)) - klik[1]) ** 2) ** 0.5
            if d < best_d:
                best_f, best_w, best_d = fi, wi, d
    return best_f, best_w


def _isi_lubang(vals: list[Optional[float]], bawaan: float) -> list[float]:
    """Interpolasi linier atas tanda -1 (tanpa deteksi); tepi memakai
    nilai deteksi terdekat. Posisi piksel selalu >= 0 → -1 aman dipakai
    sebagai penanda 'tidak ada deteksi'.
    """
    n = len(vals)
    if n == 0:
        return []
    out: list[float] = [float(v) if v is not None else -1.0 for v in vals]
    if all(v < 0 for v in out):
        return [bawaan] * n
    # tepi kiri: tahan nilai deteksi pertama
    first_i = next(i for i, v in enumerate(out) if v >= 0)
    for i in range(first_i):
        out[i] = out[first_i]
    # tepi kanan: tahan nilai deteksi terakhir
    last_i = max(i for i, v in enumerate(out) if v >= 0)
    for i in range(last_i + 1, n):
        out[i] = out[last_i]
    # lubung tengah: interpolasi linier antara dua deteksi
    i = 0
    while i < n:
        if out[i] < 0:
            lo = i - 1                      # out[lo] pasti >= 0
            hi = i
            while hi < n and out[hi] < 0:
                hi += 1
            v0 = out[lo]
            v1 = out[hi]                    # tepi kanan sudah diisi → hi < n
            for k in range(i, hi):
                t = (k - lo) / max(1, hi - lo)
                out[k] = v0 + (v1 - v0) * t
            i = hi
        else:
            i += 1
    return out


def trajektori_subjek(frames: list[dict[str, Any]], fps: float,
                      klik: tuple[float, float],
                      scene_start: float, scene_end: float,
                      src_w: int, t_ref: Optional[float] = None,
                      ) -> dict[str, Any]:
    """Kamera mengikuti subjek terpilih pada rentang scene.

    t_ref = waktu video saat pengguna MENGAITKAN subjek (klik) — pencarian
    wajah terdekat berpusat di situ, bukan di awal scene (user bisa scrub
    ke tengah scene dulu baru klik). Default: awal scene.

    Balik {"start","end","x":[px sumber],"fps","selected":{cx,cy}}.
    x = posisi X piksel sumber — format sama dengan trajectory analisis
    wajah (dipakai render_preview_fast/render_clip).
    """
    if not frames:
        return {}
    n = len(frames)
    i0 = max(0, min(n - 1, int(round(scene_start * fps))))
    i1 = max(i0 + 1, min(n - 1, int(round(scene_end * fps))))

    f_awal, w_awal = _pilih_subjek(
        frames, klik, fps, scene_start if t_ref is None else float(t_ref))
    if f_awal < 0:
        return {}
    faces_awal = frames[f_awal].get("faces") or []
    if not faces_awal:
        return {}
    cur_cx = float(faces_awal[w_awal].get("cx", .5))
    cur_cy = float(faces_awal[w_awal].get("cy", .5))
    selected = {"cx": round(cur_cx, 4), "cy": round(cur_cy, 4)}

    # tracking greedy nearest: tiap frame, wajah terdekat dari posisi
    # subjek di frame sebelumnya. Asosiasi identitas layout_frames per
    # frame sudah urut, jadi ini stabil untuk gerakan normal dan tidak
    # melompat antar orang (jarak dihitung ke posisi subjek, bukan klik).
    xs_raw: list[Optional[float]] = []
    for fi in range(i0, i1 + 1):
        faces = frames[fi].get("faces") or []
        if not faces:
            xs_raw.append(None)
            continue
        best_i, best_d = 0, 1e9
        for wi, f in enumerate(faces):
            d = ((float(f.get("cx", .5)) - cur_cx) ** 2
                 + (float(f.get("cy", .5)) - cur_cy) ** 2) ** 0.5
            if d < best_d:
                best_i, best_d = wi, d
        f = faces[best_i]
        cur_cx = float(f.get("cx", cur_cx))
        cur_cy = float(f.get("cy", cur_cy))
        xs_raw.append(cur_cx * (src_w if src_w else 1.0))

    xs = _isi_lubang(xs_raw, float(src_w / 2 if src_w else 0.5))
    # penghalusan rata-rata bergerak 3-titik
    halus: list[float] = []
    for i in range(len(xs)):
        lo = max(0, i - 1)
        hi = min(len(xs), i + 2)
        halus.append(sum(xs[lo:hi]) / (hi - lo))

    return {"start": float(scene_start), "end": float(scene_end),
            "x": [round(v, 1) for v in halus], "fps": float(fps),
            "selected": selected}


def kotak_subjek(frames: list[dict[str, Any]], fps: float,
                 klik: tuple[float, float],
                 scene_start: float, scene_end: float,
                 t_ref: Optional[float] = None) -> dict[str, Any]:
    """Kotak subjek terpilih PER FRAME — dipakai UI menggambar border
    tracking yang MENGIKUTI subjek di video (tanpa menyimpan apa pun).

    Balik {"fps","start","boxes":[{cx,cy,w}|None,...]} — cx/cy/w ternormal
    (0..1) terhadap frame sumber; w = fraksi lebar wajah (w_frac).
    """
    if not frames:
        return {}
    n = len(frames)
    i0 = max(0, min(n - 1, int(round(scene_start * fps))))
    i1 = max(i0 + 1, min(n - 1, int(round(scene_end * fps))))
    f_awal, w_awal = _pilih_subjek(
        frames, klik, fps, scene_start if t_ref is None else float(t_ref))
    if f_awal < 0:
        return {}
    faces_awal = frames[f_awal].get("faces") or []
    if not faces_awal:
        return {}
    cur_cx = float(faces_awal[w_awal].get("cx", .5))
    cur_cy = float(faces_awal[w_awal].get("cy", .5))
    boxes: list[Optional[dict[str, float]]] = []
    for fi in range(i0, i1 + 1):
        faces = frames[fi].get("faces") or []
        if not faces:
            boxes.append(None)
            continue
        best_i, best_d = 0, 1e9
        for wi, f in enumerate(faces):
            d = ((float(f.get("cx", .5)) - cur_cx) ** 2
                 + (float(f.get("cy", .5)) - cur_cy) ** 2) ** 0.5
            if d < best_d:
                best_i, best_d = wi, d
        f = faces[best_i]
        cur_cx = float(f.get("cx", cur_cx))
        cur_cy = float(f.get("cy", cur_cy))
        boxes.append({"cx": round(cur_cx, 4), "cy": round(cur_cy, 4),
                      "w": round(float(f.get("w_frac", 0) or 0), 4)})
    return {"fps": float(fps), "start": float(scene_start), "boxes": boxes}


async def pastikan_layout(clip: dict[str, Any], ct: dict[str, Any], *,
                          render_mod=None, source_url_for=None,
                          run_sync=None) -> dict[str, Any]:
    """Pastikan camera_track punya layout_frames (analisis penuh sekali bila
    kosong). Balik camera_track yang sudah lengkap (TANPA menyimpan)."""
    frames = ct.get("layout_frames") or []
    if frames or render_mod is None or source_url_for is None:
        return ct
    projs = await _sb("GET", f"projects?id=eq.{clip['project_id']}"
                            "&select=id,storage_path,user_id")
    if not projs:
        raise RuntimeError("proyek tidak ditemukan")
    url = await source_url_for(projs[0])
    if not url:
        raise RuntimeError("sumber video tidak tersedia")
    if run_sync is None:
        from anyio import to_thread
        run_sync = to_thread.run_sync
    st = await run_sync(lambda: render_mod.analyze_speaker_track(
        url, float(clip["start_time"]), float(clip["end_time"])))
    return {**ct,
            "layout_frames": st.get("layout_frames") or [],
            "analysis_fps": float(st.get("analysis_fps") or 15.0),
            "src_w": int(st.get("src_w") or 0)}


async def pratinjau_manual_track(clip_id: str, user_id: str,
                                 body: dict[str, Any], *,
                                 render_mod=None, source_url_for=None,
                                 run_sync=None) -> dict[str, Any]:
    """POST /api/manual-track/{clip_id}/preview — pratinjau TANPA menyimpan.

    Mengembalikan kotak subjek per frame supaya UI bisa menampilkan border
    yang mengikuti subjek SEBELUM user menekan "kunci".
    """
    clip = await muat_klip(clip_id)
    if str(clip.get("user_id")) != str(user_id):
        raise RuntimeError("bukan milik pengguna ini")
    dur = float(clip["end_time"]) - float(clip["start_time"])
    s0 = max(0.0, min(dur, float(body.get("scene_start", 0) or 0)))
    s1 = float(body.get("scene_end", 0) or 0)
    if s1 <= s0:
        s1 = min(dur, s0 + 1.0)
    s1 = min(dur, max(s1, s0 + 0.3))
    klik = (max(0.0, min(1.0, float(body.get("cx", .5)))),
            max(0.0, min(1.0, float(body.get("cy", .5)))))
    t_ref = body.get("t_ref")

    ct = clip.get("camera_track") or {}
    if isinstance(ct, str):
        import json as _json
        try:
            ct = _json.loads(ct)
        except ValueError:
            ct = {}
    ct = await pastikan_layout(clip, ct, render_mod=render_mod,
                               source_url_for=source_url_for,
                               run_sync=run_sync)
    frames = ct.get("layout_frames") or []
    fps = float(ct.get("analysis_fps") or 15.0)

    hasil = kotak_subjek(frames, fps, klik, s0, s1,
                         t_ref=float(t_ref) if t_ref is not None else None)
    if not hasil:
        raise RuntimeError("tidak ada wajah terdeteksi — coba klik lebih "
                           "dekat ke orang/benda di video")
    return {"ok": True, **hasil}


async def simpan_manual_track(clip_id: str, user_id: str,
                              body: dict[str, Any], *,
                              render_mod=None, source_url_for=None,
                              run_sync=None) -> dict[str, Any]:
    """POST /api/manual-track/{clip_id}.

    body: {"scene_start": s, "scene_end": e, "cx": 0..1, "cy": 0..1}
    — cx/cy = titik KLIK pengguna pada video SUMBER 16:9.
    """
    clip = await muat_klip(clip_id)
    if str(clip.get("user_id")) != str(user_id):
        raise RuntimeError("bukan milik pengguna ini")

    dur = float(clip["end_time"]) - float(clip["start_time"])
    scene_start = max(0.0, min(dur, float(body.get("scene_start", 0) or 0)))
    scene_end = float(body.get("scene_end", 0) or 0)
    if scene_end <= scene_start:
        scene_end = min(dur, scene_start + 1.0)
    scene_end = min(dur, max(scene_end, scene_start + 0.3))
    klik = (max(0.0, min(1.0, float(body.get("cx", .5)))),
            max(0.0, min(1.0, float(body.get("cy", .5)))))
    t_ref = body.get("t_ref")

    ct = clip.get("camera_track") or {}
    if isinstance(ct, str):
        import json as _json
        try:
            ct = _json.loads(ct)
        except ValueError:
            ct = {}

    ct = await pastikan_layout(clip, ct, render_mod=render_mod,
                              source_url_for=source_url_for,
                              run_sync=run_sync)
    frames = ct.get("layout_frames") or []
    fps = float(ct.get("analysis_fps") or 15.0)
    src_w = int(ct.get("src_w") or 0)

    t = trajektori_subjek(
        frames, fps, klik, scene_start, scene_end, src_w,
        t_ref=float(t_ref) if t_ref is not None else None)
    if not t:
        raise RuntimeError("tidak ada wajah terdeteksi — coba klik lebih "
                           "dekat ke orang/benda di video")

    manual = ct.get("manual") or {"scenes": []}
    if isinstance(manual, str):
        import json as _json
        try:
            manual = _json.loads(manual)
        except ValueError:
            manual = {"scenes": []}
    scenes = list(manual.get("scenes") or [])
    # scene baru MENIMPA scene lama yang tumpang-tindih rentangnya
    scenes = [s for s in scenes
              if not (float(s.get("start", -99)) < scene_end
                      and float(s.get("end", -99)) > scene_start)]
    scenes.append({"start": t["start"], "end": t["end"],
                   "x": t["x"], "fps": t["fps"], "selected": t["selected"]})
    manual["scenes"] = scenes
    ct["manual"] = manual

    await _sb("PATCH", f"clips?id=eq.{clip_id}",
              json={"camera_track": ct,
                    "preview_url": None, "preview_ready": False})
    # berkas preview lama TIDAK lagi mewakili framing baru → hapus supaya
    # cache-buster tidak mengangkatnya (bug terukur di uji 2026-09-06)
    try:
        from .render_clip import hapus_preview_cache
        await hapus_preview_cache(clip_id, str(clip.get("user_id")))
    except Exception as exc:
        print(f"[manual-track] hapus cache preview gagal (lanjut): {exc}")
    try:
        from .background import _berkunci
        from .preview_progress import clear_progress
        tugas = _berkunci.get(f"preview:{clip_id}")
        if tugas is not None and not tugas.done():
            tugas.cancel()
        clear_progress(clip_id)
    except Exception as exc:
        print(f"[manual-track] gagal membatalkan task preview: {exc}")

    return {"ok": True, "scenes": scenes, "selected": t["selected"],
            "frames": len(t["x"])}


def gabungkan_manual(st: dict[str, Any],
                     ct: Optional[dict[str, Any]],
                     ) -> tuple[Optional[list[float]], list[int]]:
    """Gabungkan trajektori otomatis + manual scenes (dipakai render).

    Rentang scene manual MENIMPA trajektori otomatis pada rentangnya —
    "Scene-by-Scene: subjek berbeda untuk adegan berbeda" terpenuhi.
    """
    manual = ((ct or {}).get("manual") or {})
    scenes = manual.get("scenes") or []
    if not scenes:
        return st.get("trajectory"), list(st.get("cuts") or [])

    traj = list(st.get("trajectory") or [])
    fps = float(st.get("analysis_fps") or 15.0)
    cuts = list(st.get("cuts") or [])
    for s in scenes:
        s0 = float(s.get("start", 0))
        xs = s.get("x") or []
        if not xs:
            continue
        i0 = max(0, int(round(s0 * fps)))
        for k, xi in enumerate(xs):
            idx = i0 + k
            if idx < len(traj):
                traj[idx] = float(xi)
            else:
                traj.append(float(xi))
        if i0 not in cuts:
            cuts.append(int(i0))
    return traj, cuts
