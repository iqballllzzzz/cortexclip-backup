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

import threading
from typing import Any, Optional

import numpy as np

from .speaker_track import (DISCOVER_EVERY, EMA_DOWN, EMA_UP, LOST_S,
                            MAX_DRIFT, MAX_FACES, MERGE_RATIO,
                            MIN_FACE_RATIO, MIN_SAMPLES, RECENT_FRAMES,
                            RETIRE_S, ROI_RETRY, ROI_SCALE, WIN_FRAMES,
                            assign, face_from_landmarks)

_mesh: Any = None
_roi_mesh: Any = None
# FaceMesh juga TIDAK aman-thread: satu objek memelihara state grafik kalkulator
# MediaPipe, dan memanggil process() dari dua thread sekaligus membuat proses
# mati SEGV. Preview dijalankan di kolam thread (to_thread.run_sync), jadi tiap
# thread harus punya instansnya sendiri.
_tls = threading.local()


def _new_mesh(static: bool, max_faces: int):
    import mediapipe as mp
    return mp.solutions.face_mesh.FaceMesh(
        static_image_mode=static, max_num_faces=max_faces,
        refine_landmarks=False, min_detection_confidence=0.35,
        min_tracking_confidence=0.35)


def get_mesh():
    """FaceMesh penemuan (frame penuh), satu per thread."""
    m = getattr(_tls, "mesh", None)
    if m is None:
        m = _new_mesh(False, MAX_FACES)
        _tls.mesh = m
    return m


def _get_roi_mesh():
    """FaceMesh untuk ROI: static_image_mode=True, satu per thread.

    Wajib static: satu instance dipakai bergantian untuk beberapa ROI berbeda
    dalam frame yang sama, jadi state pelacakan antar-frame justru menyesatkan.
    """
    m = getattr(_tls, "roi_mesh", None)
    if m is None:
        m = _new_mesh(True, 1)
        _tls.roi_mesh = m
    return m


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


def _roi_once(frame: np.ndarray, t: dict[str, Any], scale: float
              ) -> Optional[dict[str, Any]]:
    """Satu percobaan pengukuran pada ROI dengan lebar tertentu."""
    h, w = frame.shape[:2]
    hw = max(14.0, t["fw"] * scale)
    hh = max(14.0, t["fh"] * scale)
    x0, x1 = int(max(0, t["cx"] - hw)), int(min(w, t["cx"] + hw))
    y0, y1 = int(max(0, t["cy"] - hh)), int(min(h, t["cy"] + hh))
    if x1 - x0 < 32 or y1 - y0 < 32:
        return None
    res = _get_roi_mesh().process(np.ascontiguousarray(frame[y0:y1, x0:x1]))
    faces = res.multi_face_landmarks or []
    if not faces:
        return None
    # kalau ROI kebetulan memuat dua wajah (orang berdempetan), ambil yang
    # PALING DEKAT dengan posisi track ini — jangan sampai identitas tertukar
    best = None
    for f in faces:
        d = face_from_landmarks(f.landmark, x1 - x0, y1 - y0)
        d["cx"] += x0
        d["cy"] += y0
        dist = abs(d["cx"] - t["cx"]) + abs(d["cy"] - t["cy"]) * 0.6
        if best is None or dist < best[0]:
            best = (dist, d)
    if best is None:
        return None
    d = best[1]
    d["area"] = (d["fw"] * d["fh"]) / (w * h)
    return d


def refine_track(frame: np.ndarray, t: dict[str, Any]) -> Optional[dict[str, Any]]:
    """Ukur ulang satu track memakai potongan di sekitar posisi terakhirnya.

    Dua percobaan: ROI normal, lalu ROI lebih lebar. Kepala yang bergerak cepat
    (justru saat orangnya bicara) bisa keluar dari ROI sempit; kalau pengukuran
    gagal, jendela penilaian 1 detik jadi bolong dan pembicaranya kehilangan skor.

    Hasil yang MELOMPAT jauh ditolak: ROI lebar bisa menangkap wajah tetangga
    (dua orang berdempetan), dan kalau diterima, dua track akan menempel pada
    satu wajah — dulu ini membuat satu orang muncul sebagai 5 identitas.
    """
    d = _roi_once(frame, t, ROI_SCALE)
    if d is None:
        d = _roi_once(frame, t, ROI_RETRY)
    if d is None:
        return None
    if abs(d["cx"] - t["cx"]) > t["fw"] * MAX_DRIFT:
        return None
    return d


def merge_duplicate_tracks(tracks: list[dict[str, Any]]) -> None:
    """Gabungkan track yang menempel pada wajah yang sama.

    Penemuan berkala pada frame penuh bisa memberi kotak yang cukup bergeser dari
    track yang sudah ada sehingga lolos asosiasi dan menjadi identitas kedua untuk
    orang yang sama. Track yang lebih tua dipertahankan beserta riwayat bukaan
    mulutnya (yang lebih panjang), yang muda dibuang.
    """
    i = 0
    while i < len(tracks):
        j = i + 1
        while j < len(tracks):
            a, b = tracks[i], tracks[j]
            lim = max(6.0, min(a["fw"], b["fw"]) * MERGE_RATIO)
            if abs(a["cx"] - b["cx"]) <= lim and abs(a["cy"] - b["cy"]) <= lim:
                keep, drop = (a, b) if a["uid"] <= b["uid"] else (b, a)
                if len(drop["ap"]) > len(keep["ap"]):
                    keep["ap"] = drop["ap"]
                    keep["speak"] = drop["speak"]
                keep["last"] = max(a["last"], b["last"])
                tracks.remove(drop)
                if drop is a:
                    i -= 1
                    break
            else:
                j += 1
        i += 1


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
            # Skor diturunkan (bukan riwayatnya dibuang): wajah bisa hilang
            # sebentar 1-2 frame, dan kalau riwayat dihapus si pembicara justru
            # kehilangan skornya sama sekali (terbukti merusak: skor jadi 0).
            t["speak"] *= EMA_DOWN
            continue
        t.update({"cx": d["cx"], "cy": d["cy"], "fw": d["fw"],
                  "fh": d["fh"], "area": d["area"], "last": fi})
        if not freeze:
            # riwayat menyimpan (frame, bukaan) supaya jendela penilaian diukur
            # dalam WAKTU: kalau diukur dalam jumlah sampel, wajah yang deteksinya
            # bolong akan menilai rentang waktu yang jauh lebih panjang dari 1
            # detik dan skornya tidak sebanding dengan wajah lain
            t["ap"].append((fi, d["aperture"]))
            t["ap"] = [(f, a) for (f, a) in t["ap"] if fi - f < WIN_FRAMES]
        matched.append(t)

    # penemuan wajah pada frame penuh SETIAP frame. Sebelumnya hanya 1x/detik
    # dan itu terbukti fatal: kalau ROI satu track gagal beberapa kali (paling
    # sering justru saat orangnya bicara — kepala bergerak), track-nya mati dan
    # tidak dihidupkan lagi sampai penemuan berikutnya. Kandidat pembicara
    # hilang 2+ detik dan kamera terkunci pada orang yang salah.
    if fi % DISCOVER_EVERY == 0 or not tracks:
        dets = discover_faces(mesh, frame)
        pairing = assign(dets, tracks)
        for di, d in enumerate(dets):
            ti = pairing.get(di)
            if ti is not None:
                # wajah ini sudah punya identitas; kalau ROI-nya gagal tadi,
                # pakai hasil penemuan ini supaya riwayat tidak bolong
                t = tracks[ti]
                # DIKONFIRMASI oleh deteksi frame penuh. Penting: ROI kadang
                # "menemukan" wajah di tekstur latar (mikrofon, rak) dan track
                # palsu itu ikut terhitung hidup, sehingga aturan "kalau hanya
                # satu wajah terlihat, pindah ke sana" tidak pernah aktif dan
                # kamera menatap ruang kosong. Terukur pada podcast nyata: 3
                # detik dengan error 83-88% lebar crop.
                t["seen_full"] = fi
                if t["last"] != fi:
                    t.update({"cx": d["cx"], "cy": d["cy"], "fw": d["fw"],
                              "fh": d["fh"], "area": d["area"], "last": fi})
                    if not freeze:
                        t["ap"].append((fi, d["aperture"]))
                        t["ap"] = [(f, a) for (f, a) in t["ap"]
                                   if fi - f < WIN_FRAMES]
                    matched.append(t)
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
                reuse["seen_full"] = fi
                reuse["ap"].append((fi, d["aperture"]))
                tracks.append(reuse)
                matched.append(reuse)
            else:
                nt = {"uid": next_uid[0], "speak": 0.0, "seen_full": fi,
                      "ap": [(fi, d["aperture"])], **base}
                tracks.append(nt)
                matched.append(nt)
                next_uid[0] += 1

    stale = [t for t in tracks if fi - t["last"] > fps * LOST_S]
    if stale:
        retired.extend(stale)
        retired[:] = [t for t in retired
                      if fi - t["last"] <= fps * RETIRE_S][-12:]
    tracks[:] = [t for t in tracks if fi - t["last"] <= fps * LOST_S]
    merge_duplicate_tracks(tracks)
    # Kandidat = wajah yang terlihat BARU SAJA, bukan hanya pada frame ini.
    # Deteksi wajah kadang bolong 1-3 frame; kalau kandidat dibatasi frame ini
    # saja, pembicara yang wajahnya sekejap hilang langsung dianggap tidak ada
    # dan kamera berpindah ke orang lain (face tracking "mati senyap").
    return [t for t in tracks if fi - t["last"] <= RECENT_FRAMES]


def commit_speak(tracks: list[dict[str, Any]], fi: int) -> None:
    """Skor bicara = simpangan baku bukaan mulut pada jendela terakhir (ber-EMA).

    Orang yang bicara: bukaan mulut naik-turun terus, simpangan besar.
    Orang yang diam: bukaan hampir tetap, simpangan mendekati nol.

    Jendela dibersihkan di sini memakai `fi` untuk SEMUA track, bukan hanya yang
    dapat sampel baru. Tanpa itu, track yang deteksinya bolong menahan sampel
    lama selamanya sehingga skornya "macet tinggi" — persis penyebab kamera
    terkunci pada orang yang sudah berhenti bicara.
    """
    for t in tracks:
        t["ap"] = [(f, a) for (f, a) in t["ap"] if fi - f < WIN_FRAMES]
        if len(t["ap"]) < MIN_SAMPLES:
            t["speak"] *= (1.0 - EMA_DOWN)      # tidak ada bukti → luruh
            continue
        vals = np.asarray([a for (_f, a) in t["ap"]], dtype=np.float32)
        score = float(vals.std())
        a = EMA_UP if score > t["speak"] else EMA_DOWN
        t["speak"] = t["speak"] * (1 - a) + score * a
