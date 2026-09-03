"""ByteTrack + filter Kalman — langkah 2 & 3 pipeline face tracking.

BYTETRACK (asosiasi dua tahap)
Deteksi dibagi dua: keyakinan TINGGI dan RENDAH. Tahap pertama mencocokkan track
yang ada dengan deteksi berkeyakinan tinggi memakai IoU. Track yang belum
mendapat pasangan dicoba lagi pada deteksi berkeyakinan rendah — inilah inti
ByteTrack: wajah yang untuk sesaat kurang jelas (menoleh, tertutup mikrofon)
tetap mempertahankan identitasnya, bukan dianggap hilang lalu muncul sebagai
orang baru. Identitas yang stabil itu prasyarat "siapa yang bicara".

KALMAN (kecepatan konstan)
Setiap track memelihara [x, y, vx, vy]. Prediksi memindahkan kotak mengikuti
kecepatannya sebelum asosiasi, jadi wajah yang bergerak tetap terpasang pada
identitasnya. Pengukuran yang berderau dihaluskan oleh gain Kalman — ini
peredam getar tahap pertama, sebelum stabilizer kamera.
"""
from __future__ import annotations

from typing import Any, Optional

import numpy as np

from .face_yunet import iou

# ---- parameter ByteTrack ----------------------------------------------------
HIGH_THRESH = 0.70        # deteksi >= ini masuk tahap pertama
LOW_THRESH = 0.40         # deteksi antara LOW..HIGH dipakai tahap kedua
IOU_MATCH = 0.25          # ambang IoU untuk dianggap pasangan
IOU_MATCH_LOW = 0.15      # tahap kedua lebih longgar
MAX_LOST = 45             # frame tanpa pasangan sebelum track dipensiunkan (3s @15fps)
MIN_HITS = 2              # track baru dianggap sah setelah 2x terlihat
MIN_FACE_PX = 26          # wajah lebih kecil dari ini (piksel analisis) diabaikan

# ---- parameter Kalman ------------------------------------------------------
KF_Q_POS = 1.0            # derau proses posisi
KF_Q_VEL = 12.0           # derau proses kecepatan (besar = lebih gesit)
KF_R = 9.0                # derau pengukuran (besar = lebih halus, lebih lambat)


class KalmanXY:
    """Kalman 4 keadaan [x, y, vx, vy] dengan model kecepatan konstan.

    Ditulis sendiri (bukan filterpy) karena hanya 4x4: menambah dependensi untuk
    ini tidak sepadan, dan numpy sudah ada.
    """

    def __init__(self, x: float, y: float) -> None:
        self.s = np.array([x, y, 0.0, 0.0], dtype=np.float64)
        self.P = np.diag([KF_R, KF_R, 100.0, 100.0]).astype(np.float64)
        self.F = np.array([[1, 0, 1, 0],
                           [0, 1, 0, 1],
                           [0, 0, 1, 0],
                           [0, 0, 0, 1]], dtype=np.float64)
        self.H = np.array([[1, 0, 0, 0],
                           [0, 1, 0, 0]], dtype=np.float64)
        self.Q = np.diag([KF_Q_POS, KF_Q_POS, KF_Q_VEL, KF_Q_VEL]).astype(np.float64)
        self.R = np.diag([KF_R, KF_R]).astype(np.float64)

    def predict(self) -> tuple[float, float]:
        self.s = self.F @ self.s
        self.P = self.F @ self.P @ self.F.T + self.Q
        return float(self.s[0]), float(self.s[1])

    def update(self, x: float, y: float) -> tuple[float, float]:
        z = np.array([x, y], dtype=np.float64)
        y_res = z - self.H @ self.s
        S = self.H @ self.P @ self.H.T + self.R
        K = self.P @ self.H.T @ np.linalg.inv(S)
        self.s = self.s + K @ y_res
        self.P = (np.eye(4) - K @ self.H) @ self.P
        return float(self.s[0]), float(self.s[1])

    @property
    def pos(self) -> tuple[float, float]:
        return float(self.s[0]), float(self.s[1])

    @property
    def vel(self) -> tuple[float, float]:
        return float(self.s[2]), float(self.s[3])

    def freeze(self) -> None:
        """Nolkan kecepatan: dipakai saat track TIDAK mendapat pengukuran.

        Model kecepatan-konstan akan terus mengekstrapolasi wajah yang sudah
        hilang, dan track hantu itu menarik kamera ke ruang kosong. Membekukan
        kecepatan membuat posisi prediksi berhenti di tempat terakhir.
        """
        self.s[2] = 0.0
        self.s[3] = 0.0


def _greedy_match(tracks: list[dict[str, Any]], dets: list[dict[str, Any]],
                  thresh: float) -> list[tuple[int, int]]:
    """Pasangkan track<->deteksi dengan IoU terbesar lebih dulu.

    Greedy global, bukan berurutan: dua wajah berdampingan tidak saling tukar
    identitas seperti pada pencocokan satu-per-satu.
    """
    pairs: list[tuple[float, int, int]] = []
    for ti, t in enumerate(tracks):
        for di, d in enumerate(dets):
            v = iou(t["box"], d)
            if v >= thresh:
                pairs.append((v, ti, di))
    pairs.sort(reverse=True)
    out: list[tuple[int, int]] = []
    tu: set[int] = set()
    du: set[int] = set()
    for _, ti, di in pairs:
        if ti in tu or di in du:
            continue
        out.append((ti, di))
        tu.add(ti)
        du.add(di)
    return out


class ByteTracker:
    """Pelacak multi-wajah: ID stabil + posisi ter-Kalman."""

    def __init__(self) -> None:
        self.tracks: list[dict[str, Any]] = []
        self._next = 1

    def _new(self, d: dict[str, Any], fi: int) -> dict[str, Any]:
        kf = KalmanXY(d["cx"], d["cy"])
        t = {
            "uid": self._next, "kf": kf, "box": dict(d), "det": dict(d),
            "cx": d["cx"], "cy": d["cy"], "fw": d["fw"], "fh": d["fh"],
            "roll": d["roll"], "area": d["area"], "score": d["score"],
            "last": fi, "hits": 1, "lost": 0, "start": fi,
            # seen_full: frame terakhir wajah ini benar-benar TERDETEKSI (bukan
            # cuma diprediksi Kalman). Dipakai speaker_pick untuk membedakan
            # kandidat nyata dari track yang sedang melayang.
            "seen_full": fi,
            "ap": [], "speak": 0.0, "confirmed": False,
        }
        self._next += 1
        return t

    def update(self, dets: list[dict[str, Any]], fi: int) -> list[dict[str, Any]]:
        """Satu langkah. Balik track yang AKTIF pada frame ini."""
        # Wajah sangat kecil dibuang lebih dulu: landmark-nya bertumpuk sehingga
        # rasio mulut/mata jadi liar dan skor bicaranya melonjak tak masuk akal
        # (terukur 3.8-4.0 vs 0.05 untuk pembicara sesungguhnya).
        dets = [d for d in dets if d["fw"] >= MIN_FACE_PX]
        # 1) prediksi Kalman untuk semua track, geser kotaknya
        for t in self.tracks:
            px, py = t["kf"].predict()
            dx, dy = px - t["cx"], py - t["cy"]
            b = t["box"]
            t["box"] = {"x1": b["x1"] + dx, "y1": b["y1"] + dy,
                        "x2": b["x2"] + dx, "y2": b["y2"] + dy}
            t["cx"], t["cy"] = px, py

        hi = [d for d in dets if d["score"] >= HIGH_THRESH]
        lo = [d for d in dets if LOW_THRESH <= d["score"] < HIGH_THRESH]

        # 2) tahap pertama: track vs deteksi keyakinan TINGGI
        m1 = _greedy_match(self.tracks, hi, IOU_MATCH)
        matched_t = {ti for ti, _ in m1}
        for ti, di in m1:
            self._apply(self.tracks[ti], hi[di], fi)

        # 3) tahap kedua (inti ByteTrack): track sisa vs keyakinan RENDAH
        rest = [i for i in range(len(self.tracks)) if i not in matched_t]
        sub = [self.tracks[i] for i in rest]
        m2 = _greedy_match(sub, lo, IOU_MATCH_LOW)
        used_lo: set[int] = set()
        for si, di in m2:
            self._apply(sub[si], lo[di], fi)
            matched_t.add(rest[si])
            used_lo.add(di)

        # 4) track tanpa pasangan → hitung hilang
        for i, t in enumerate(self.tracks):
            if i not in matched_t:
                t["lost"] += 1
                # BEKUKAN kecepatan. Tanpa ini prediksi kecepatan-konstan terus
                # menggeser track yang sudah tidak terlihat: terukur pada uji 3
                # orang, track yang hilang melayang 10 px setiap 0.2 detik
                # sehingga kamera mengikutinya dari x=520 ke x=651 selama 2.6
                # detik — persis "menyorot ruang kosong". Wajah yang hilang harus
                # DIAM di tempat terakhir, bukan diekstrapolasi.
                t["kf"].freeze()

        # 5) deteksi keyakinan tinggi yang tak terpakai → identitas baru
        used_hi = {di for _, di in m1}
        for di, d in enumerate(hi):
            if di in used_hi:
                continue
            # jangan buat identitas baru yang menumpuk track lama
            if any(iou(t["box"], d) > 0.5 for t in self.tracks):
                continue
            self.tracks.append(self._new(d, fi))

        # 6) pensiunkan yang terlalu lama hilang
        self.tracks = [t for t in self.tracks if t["lost"] <= MAX_LOST]
        return [t for t in self.tracks
                if t["last"] == fi and t["hits"] >= MIN_HITS]

    def _apply(self, t: dict[str, Any], d: dict[str, Any], fi: int) -> None:
        cx, cy = t["kf"].update(d["cx"], d["cy"])
        t.update({"box": {"x1": d["x1"], "y1": d["y1"],
                          "x2": d["x2"], "y2": d["y2"]},
                  "det": dict(d),
                  "cx": cx, "cy": cy, "fw": d["fw"], "fh": d["fh"],
                  "roll": d["roll"], "area": d["area"], "score": d["score"],
                  "last": fi, "seen_full": fi, "lost": 0})
        t["hits"] += 1
        if t["hits"] >= MIN_HITS:
            t["confirmed"] = True

    def all_tracks(self) -> list[dict[str, Any]]:
        return list(self.tracks)
