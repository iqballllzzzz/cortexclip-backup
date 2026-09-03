"""Pipeline face tracking baru: YuNet + ByteTrack + Kalman + affine + crop.

Ini alur yang diminta user, disusun ulang dengan bahan yang benar-benar ada di
VPS (tanpa GPU, tanpa PyTorch):

  [video]
    -> YuNet (CNN, ONNX di OpenCV)      : deteksi wajah + 5 landmark
    -> ByteTrack + Kalman               : ID unik stabil, posisi ter-halus
    -> rasio mulut/mata + gerbang audio : siapa yang sedang bicara
    -> pemilihan + stabilizer pegas     : kamera tepat di satu wajah
    -> sudut roll dari garis mata       : kemiringan untuk diluruskan (affine)
    -> jalur x + cuts + roll            : dipakai ffmpeg (sendcmd crop + rotate)

Penggantian YOLOv8-face dijelaskan di face_yunet.py: bobot ONNX yolov8n-face
tidak tersedia (3 sumber balas 9-29 byte) dan PyTorch tidak layak di VPS 4 core;
YuNet mengukur 100% recall vs 85% FaceMesh pada podcast uji, dengan 9.7 ms/frame.
"""
from __future__ import annotations

from typing import Any, Optional

import numpy as np

from . import face_yunet
from .face_bytetrack import ByteTracker
from .face_speak import (SPEAK_ON, audio_envelope, commit_speak, push_sample)
from .speaker_pick import build_trajectory, pick_active
from .speaker_track import SAMPLE_FPS, SCENE_CUT_DIFF

# batas kemiringan yang diperbaiki: lebih dari ini biasanya salah deteksi
MAX_ROLL_FIX = 12.0
ROLL_EMA = 0.12           # penghalusan sudut (lambat: rotasi harus tenang)


def analyze(src: str, start: float, end: float, *, probe_size, run_ffmpeg,
            aspect: float, analysis_width: int = 640,
            max_seconds: float = 180.0, on_progress=None,
            **_ignored) -> dict[str, Any]:
    """Jalur kamera + kemiringan. Balik dict siap dipakai render."""
    empty = {"trajectory": [], "faces": 0, "switches": 0, "cuts": [],
             "analysis_fps": SAMPLE_FPS, "roll": [], "engine": "yunet"}
    try:
        w, h = probe_size(src)
    except Exception as exc:
        print(f"[face-track] probe_size gagal: {exc}")
        return empty

    dur = min(end - start, max_seconds)
    if dur <= 0.3:
        print(f"[face-track] durasi tidak valid ({dur:.2f}s) → crop tengah")
        return empty

    ah = max(180, int(analysis_width * h / w / 2) * 2)
    aw = int(ah * w / h / 2) * 2
    try:
        raw = run_ffmpeg(["ffmpeg", "-v", "error",
                          "-ss", f"{start:.3f}", "-t", f"{dur:.3f}", "-i", src,
                          "-vf", f"scale={aw}:{ah}",
                          "-r", str(SAMPLE_FPS), "-f", "rawvideo",
                          "-pix_fmt", "rgb24", "-"], timeout=900).stdout
    except Exception as exc:
        print(f"[face-track] decode frame gagal: {str(exc)[:140]}")
        return empty

    fb = aw * ah * 3
    n = len(raw) // fb
    if n < 8:
        print(f"[face-track] frame terlalu sedikit ({n}) → crop tengah")
        return empty
    frames = np.frombuffer(raw[: n * fb], dtype=np.uint8).reshape(n, ah, aw, 3)

    audio = audio_envelope(src, start, dur, SAMPLE_FPS, run_ffmpeg)

    tracker = ByteTracker()
    state: dict[str, Any] = {"uid": None, "hold": 0, "hold_uid": None,
                             "last_cut": -10 ** 6}
    targets: list[float] = []
    rolls: list[float] = []
    cuts: set[int] = set()
    max_faces = 0
    switches = 0
    prev_small = None
    roll_s = 0.0

    for fi in range(n):
        if on_progress is not None and (fi % 15 == 0 or fi == n - 1):
            try:
                on_progress(int(fi / max(1, n - 1) * 100))
            except Exception:
                pass

        small = frames[fi][::16, ::16].mean(axis=2).astype(np.float32)
        scene_cut = (prev_small is not None
                     and float(np.abs(small - prev_small).mean()) > SCENE_CUT_DIFF)
        prev_small = small

        try:
            dets = face_yunet.detect(frames[fi], min_face_ratio=0.03)
        except Exception as exc:
            print(f"[face-track] deteksi frame {fi} gagal: {exc}")
            dets = []
        live = tracker.update(dets, fi)
        max_faces = max(max_faces, len(live))

        for t in live:
            if not scene_cut:
                push_sample(t, fi, t["det"], frame_rgb=frames[fi])
        commit_speak(tracker.all_tracks(), fi, audio)

        if scene_cut:
            segar = [t for t in live if t["last"] == fi]
            if len(segar) == 1:
                state["uid"] = None
                state["hold"] = 0
                cuts.add(fi)
                live = segar

        act, is_cut = pick_active(live, state, fi, SAMPLE_FPS,
                                  all_tracks=tracker.all_tracks())
        if act is None:
            targets.append(targets[-1] if targets else aw / 2)
            rolls.append(roll_s)
            continue

        # ANTI RUANG KOSONG (jaring pengaman terakhir).
        # Kalau posisi kamera yang dipilih ternyata lebih dekat ke TITIK TENGAH
        # dua wajah daripada ke wajah mana pun, pindahkan paksa ke wajah
        # terdekat. Terukur sebelum ini: 2 rentang panjang (33 dan 39 frame,
        # 2.2-2.6 detik) kamera parkir di antara dua orang, jauh dari potongan
        # mana pun — persis yang dikeluhkan user pada screenshot.
        segar = [t for t in live if t["last"] == fi]
        if len(segar) >= 2:
            xs = sorted(t["cx"] for t in segar)
            mid = (xs[0] + xs[-1]) / 2.0
            cam = act["cx"]
            if abs(cam - mid) < min(abs(cam - x) for x in xs) - 1e-6:
                pengganti = min(segar, key=lambda t: abs(t["cx"] - cam))
                if pengganti["uid"] != act["uid"]:
                    cuts.add(fi)
                    switches += 1
                    state["uid"] = pengganti["uid"]
                    state["hold"] = 0
                    state["last_cut"] = fi
                act = pengganti

        if is_cut:
            cuts.add(fi)
            switches += 1
        targets.append(act["cx"])

        # AFFINE DEROLL: sudut dari garis mata, dihaluskan dan dibatasi.
        r = float(act.get("roll") or 0.0)
        if abs(r) > MAX_ROLL_FIX:
            r = MAX_ROLL_FIX if r > 0 else -MAX_ROLL_FIX
        roll_s = roll_s * (1 - ROLL_EMA) + r * ROLL_EMA
        rolls.append(roll_s)

    crop_w = min(int(h * aspect), w)
    traj = build_trajectory(targets, cuts, w, crop_w, aw, SAMPLE_FPS)
    return {"trajectory": traj, "faces": max_faces, "switches": switches,
            "cuts": sorted(cuts), "analysis_fps": SAMPLE_FPS,
            "roll": [round(v, 3) for v in rolls], "engine": "yunet"}
