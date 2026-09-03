"""Detektor wajah CNN + landmark mata — langkah 1 pipeline face tracking.

KENAPA YuNet, BUKAN YOLOv8-face
Alur yang diminta menyebut YOLOv8-face. YOLOv8 butuh PyTorch (~800 MB) atau bobot
ONNX yang harus diunduh; tiga sumber bobot yolov8n-face ONNX yang dicoba semuanya
mati (balasan 9-29 byte). YuNet adalah detektor wajah CNN sekelas yang sudah
tertanam di OpenCV 4.11 (cv2.FaceDetectorYN), bobotnya 227 KB, dan MEMBERI 5
LANDMARK termasuk kedua mata — yang justru dibutuhkan untuk meluruskan
kemiringan (affine deroll).

Diukur pada podcast nyata (102 frame, 640x360, klip dari screenshot user):
  YuNet    100% frame berwajah, 175 wajah, 9.7 ms/frame, 2 wajah di 45 frame
  FaceMesh  85% frame berwajah, 130 wajah, 7.2 ms/frame, 2 wajah di 23 frame

Recall itu yang menentukan: wajah yang tidak terdeteksi tidak bisa jadi kandidat
pembicara, dan itulah sebab kamera dulu tertinggal di orang yang salah.
"""
from __future__ import annotations

import math
import os
import threading
from typing import Any, Optional

import numpy as np

MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "models",
                          "face_detection_yunet_2023mar.onnx")
SCORE_THRESH = 0.55       # ambang keyakinan deteksi
NMS_THRESH = 0.3
TOP_K = 5000

_det: Any = None
_det_size: tuple[int, int] = (0, 0)
# Detektor disimpan PER THREAD. cv2.FaceDetectorYN bukan objek aman-thread:
# setInputSize() mengubah state internal, dan preview dijalankan lewat
# to_thread.run_sync (kolam thread anyio) sehingga dua permintaan bersamaan
# memanggil detect() pada objek yang SAMA dari thread berbeda. Akibatnya proses
# mati SEGV (terukur: 2x core-dump, nginx balas 502, persen beku di 4%).
_tls = threading.local()


def available() -> bool:
    """True kalau bobot YuNet ada dan OpenCV mendukungnya."""
    try:
        import cv2
        return hasattr(cv2, "FaceDetectorYN") and os.path.exists(
            os.path.abspath(MODEL_PATH))
    except Exception:
        return False


def _get(w: int, h: int):
    """Detektor YuNet milik THREAD ini, dibuat sekali lalu diubah ukurannya."""
    import cv2
    det = getattr(_tls, "det", None)
    if det is None:
        det = cv2.FaceDetectorYN.create(
            os.path.abspath(MODEL_PATH), "", (w, h),
            SCORE_THRESH, NMS_THRESH, TOP_K)
        _tls.det = det
        _tls.size = (w, h)
    elif getattr(_tls, "size", None) != (w, h):
        det.setInputSize((w, h))
        _tls.size = (w, h)
    return det


def detect(frame_rgb: np.ndarray, min_face_ratio: float = 0.03,
           conf: float | None = None) -> list[dict[str, Any]]:
    """Semua wajah pada satu frame RGB.

    Balik daftar dict: x1,y1,x2,y2,cx,cy,fw,fh,score,roll_deg,eye_l,eye_r,
    mouth_l,mouth_r,nose. Sudut roll dihitung dari garis antar-mata, dipakai
    langkah affine untuk meluruskan kepala yang miring.

    conf: ambang keyakinan sementara (untuk diagnosa). Default memakai SCORE_THRESH.
    """
    import cv2
    h, w = frame_rgb.shape[:2]
    det = _get(w, h)
    if conf is not None:
        det.setScoreThreshold(float(conf))
    bgr = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2BGR)
    try:
        _, faces = det.detect(bgr)
    except Exception as exc:
        print(f"[yunet] detect gagal: {exc}")
        return []
    finally:
        if conf is not None:
            det.setScoreThreshold(SCORE_THRESH)
    if faces is None:
        return []

    out: list[dict[str, Any]] = []
    for f in faces:
        x, y, bw, bh = float(f[0]), float(f[1]), float(f[2]), float(f[3])
        if bw / w < min_face_ratio or bh < 8:
            continue
        # 5 landmark YuNet: mata kanan, mata kiri, hidung, mulut kanan, mulut kiri
        erx, ery = float(f[4]), float(f[5])
        elx, ely = float(f[6]), float(f[7])
        nx, ny = float(f[8]), float(f[9])
        mrx, mry = float(f[10]), float(f[11])
        mlx, mly = float(f[12]), float(f[13])
        roll = math.degrees(math.atan2(ely - ery, elx - erx))
        # Pusat bingkai memakai titik tengah MATA, bukan tengah kotak: kotak
        # deteksi ikut melebar saat kepala menoleh sehingga pusatnya bergeser,
        # sedangkan titik antar-mata tetap menempel pada wajah.
        cx = (erx + elx) / 2.0
        cy = (ery + ely) / 2.0
        out.append({
            "x1": x, "y1": y, "x2": x + bw, "y2": y + bh,
            "cx": cx, "cy": cy, "fw": bw, "fh": bh,
            "box_cx": x + bw / 2.0, "box_cy": y + bh / 2.0,
            "score": float(f[14]) if len(f) > 14 else 1.0,
            "roll": roll,
            "eye_r": (erx, ery), "eye_l": (elx, ely), "nose": (nx, ny),
            "mouth_r": (mrx, mry), "mouth_l": (mlx, mly),
            "area": (bw * bh) / (w * h),
        })
    return out


def iou(a: dict[str, Any], b: dict[str, Any]) -> float:
    """Irisan-per-gabungan dua kotak. Dipakai asosiasi ByteTrack."""
    x1 = max(a["x1"], b["x1"])
    y1 = max(a["y1"], b["y1"])
    x2 = min(a["x2"], b["x2"])
    y2 = min(a["y2"], b["y2"])
    iw, ih = x2 - x1, y2 - y1
    if iw <= 0 or ih <= 0:
        return 0.0
    inter = iw * ih
    ua = (a["x2"] - a["x1"]) * (a["y2"] - a["y1"])
    ub = (b["x2"] - b["x1"]) * (b["y2"] - b["y1"])
    return inter / max(1e-6, ua + ub - inter)
