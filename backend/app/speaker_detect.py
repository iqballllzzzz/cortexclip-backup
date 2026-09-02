"""Bagian 2 speaker_track: deteksi wajah FaceMesh + pelacakan identitas.

ARSITEKTUR: penemuan + penyempurnaan per-ROI

1. PENEMUAN (setiap DISCOVER_EVERY frame): FaceMesh dijalankan pada frame penuh
   untuk mencari wajah baru. Ini murah karena hanya 1x per detik.
2. PENYEMPURNAAN (setiap frame): untuk SETIAP track yang sudah dikenal, FaceMesh
   dijalankan pada potongan kecil di sekitar posisi terakhirnya (ROI). Wajah
   mengisi hampir seluruh potongan, jadi landmark bibirnya presisi dan wajahnya
   praktis tidak pernah hilang.

Kenapa bukan cara lain (sudah diuji, gagal):

- FaceMesh frame penuh saja: wajah hilang 15-30% frame pada podcast 3 orang.
  Jendela penilaian 1 detik jadi bolong dan skor bicara tidak bisa dipercaya.
- Ubin (tile) horizontal: kontinuitas naik sedikit, tapi wajah yang sama
  terdeteksi di frame penuh DAN di ubin pada posisi yang cukup berbeda sehingga
  lolos dedup — muncul "wajah hantu" (satu panel jadi dua identitas).
  ROI tidak punya masalah ini karena setiap potongan terikat pada satu track.
"""
from __future__ import annotations

from typing import Any, Optional

import numpy as np

from .speaker_track import (DISCOVER_EVERY, EMA_DOWN, EMA_UP, LOST_S,
                            MAX_FACES, MIN_FACE_RATIO, MIN_SAMPLES, RETIRE_S,
                            ROI_SCALE, WIN_SAMPLES, assign,
                            face_from_landmarks)

_mesh: Any = None
_roi_mesh: Any = None


def _new_mesh(static: bool, max_faces: int):
    import mediapipe as mp
    return mp.solutions.face_mesh.FaceMesh(
        static_image_mode=static, max_num_faces=max_faces,
        refine_landmarks=False, min_detection_confidence=0.35,
        min_tracking_confidence=0.35)


def get_mesh():
    """FaceMesh penemuan (frame penuh), dibuat sekali dan dipakai ulang."""
    global _mesh
    if _mesh is None:
        _mesh = _new_mesh(False, MAX_FACES)
    return _mesh


def _get_roi_mesh():
    """FaceMesh untuk ROI: static_image_mode=True.

    Wajib static: satu instance dipakai bergantian untuk beberapa ROI berbeda
    dalam frame yang sama, jadi state pelacakan antar-frame justru menyesatkan.
    """
    global _roi_mesh
    if _roi_mesh is None:
        _roi_mesh = _new_mesh(True, 1)
    return _roi_mesh


def discover_faces(mesh, frame: np.ndarray) -> list[dict[str, Any]]:
    """Cari semua wajah pada frame penuh (dipanggil 1x per detik).

    Wajah kecil (di latar) dibuang supaya klip banyak orang tidak bingung.
    """
    h, w = frame.shape[:2]
    res = mesh.process(np.ascontiguousarray(frame))
    out: list[dict[str, Any]] = []
    for f in (res.multi_face_landmarks or []):
        d = face_from_landmarks(f.landmark, w, h)
        if d["fw"] / w < MIN_FACE_RATIO or d["fh"] < 4:
            continue
        out.append(d)
    return out


def refine_track(frame: np.ndarray, t: dict[str, Any]) -> Optional[dict[str, Any]]:
    """Ukur ulang satu track memakai potongan di sekitar posisi terakhirnya."""
    h, w = frame.shape[:2]
    hw = max(12.0, t["fw"] * ROI_SCALE)
    hh = max(12.0, t["fh"] * ROI_SCALE)
    x0, x1 = int(max(0, t["cx"] - hw)), int(min(w, t["cx"] + hw))
    y0, y1 = int(max(0, t["cy"] - hh)), int(min(h, t["cy"] + hh))
    if x1 - x0 < 24 or y1 - y0 < 24:
        return None
    sub = np.ascontiguousarray(frame[y0:y1, x0:x1])
    res = _get_roi_mesh().process(sub)
    faces = res.multi_face_landmarks or []
    if not faces:
        return None
    d = face_from_landmarks(faces[0].landmark, x1 - x0, y1 - y0)
    d["cx"] += x0
    d["cy"] += y0
    d["area"] = (d["fw"] * d["fh"]) / (w * h)
    return d


def track_frame(frame: np.ndarray, mesh, tracks: list[dict[str, Any]],
                retired: list[dict[str, Any]], fi: int, fps: float,
                next_uid: list[int], freeze: bool = False,
                ) -> list[dict[str, Any]]:
    """Satu langkah pelacakan: sempurnakan track lama, temukan yang baru."""
    dets: list[dict[str, Any]] = []
    matched: list[dict[str, Any]] = []

    for t in tracks:
        d = refine_track(frame, t)
        if d is None:
            continue
        t.update({"cx": d["cx"], "cy": d["cy"], "fw": d["fw"],
                  "fh": d["fh"], "area": d["area"], "last": fi})
        if not freeze:
            t["ap"].append(d["aperture"])
            if len(t["ap"]) > WIN_SAMPLES:
                t["ap"].pop(0)
        matched.append(t)

    # penemuan wajah baru: berkala, atau saat belum ada track sama sekali
    if fi % DISCOVER_EVERY == 0 or not tracks:
        dets = discover_faces(mesh, frame)
        pairing = assign(dets, tracks)
        for di, d in enumerate(dets):
            if di in pairing:
                continue
            reuse: Optional[dict[str, Any]] = None
            for rt in retired:
                if fi - rt["last"] > fps * RETIRE_S:
                    continue
                if abs(rt["cx"] - d["cx"]) + abs(rt["cy"] - d["cy"]) * 0.6 <= \
                        max(8.0, d["fw"] * 1.3):
                    reuse = rt
                    break
            base = {"cx": d["cx"], "cy": d["cy"], "fw": d["fw"],
                    "fh": d["fh"], "area": d["area"], "last": fi}
            if reuse is not None:
                retired.remove(reuse)
                reuse.update(base)
                reuse["ap"].append(d["aperture"])
                tracks.append(reuse)
                matched.append(reuse)
            else:
                nt = {"uid": next_uid[0], "speak": 0.0,
                      "ap": [d["aperture"]], **base}
                tracks.append(nt)
                matched.append(nt)
                next_uid[0] += 1

    stale = [t for t in tracks if fi - t["last"] > fps * LOST_S]
    if stale:
        retired.extend(stale)
        retired[:] = [t for t in retired
                      if fi - t["last"] <= fps * RETIRE_S][-12:]
    tracks[:] = [t for t in tracks if fi - t["last"] <= fps * LOST_S]
    return [t for t in tracks if t["last"] == fi]


def commit_speak(tracks: list[dict[str, Any]]) -> None:
    """Skor bicara = simpangan baku bukaan mulut 1 detik terakhir (ber-EMA).

    Orang yang bicara: bukaan mulut naik-turun terus, simpangan besar.
    Orang yang diam: bukaan hampir tetap, simpangan mendekati nol.
    """
    for t in tracks:
        if len(t["ap"]) < MIN_SAMPLES:
            continue
        score = float(np.std(np.asarray(t["ap"], dtype=np.float32)))
        a = EMA_UP if score > t["speak"] else EMA_DOWN
        t["speak"] = t["speak"] * (1 - a) + score * a
