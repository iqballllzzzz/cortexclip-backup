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

import subprocess
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
             "analysis_fps": SAMPLE_FPS, "roll": [], "engine": "yunet",
             "layout_frames": []}
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
    fb = aw * ah * 3
    n = max(1, int(dur * SAMPLE_FPS))

    # DECODE MENGALIR (streaming), bukan sekaligus ke memori.
    # Sebelumnya seluruh klip didekode dulu lalu ditumpuk jadi satu array:
    # klip 77 detik = 1155 frame x 640x360x3 = 761 MB untuk array + 761 MB untuk
    # bytes mentah, RSS puncak terukur 2426 MB. Dua akibatnya:
    #   (1) 24 detik pertama dari 54 detik total TIDAK melaporkan kemajuan sama
    #       sekali — inilah "Menganalisis wajah 4%" yang tampak macet;
    #   (2) beberapa pengguna bersamaan akan menghabiskan RAM 8 GB VPS ini.
    # Sekarang frame dibaca satu per satu dari pipe: memori tetap ~1 MB dan
    # persen bergerak sejak frame pertama.
    # Analisis audio dijalankan PARALEL dengan decode video. Keduanya menarik
    # data dari URL yang sama lewat jaringan, dan berurutan keduanya memakan
    # 7,5s + 6,3s = 13,8 detik hening sebelum persen pertama muncul — inilah
    # "Menganalisis wajah 4%" yang tampak macet. Paralel: tinggal ~7,5 detik.
    import threading
    hasil_audio: dict[str, Any] = {}

    def _ambil_audio() -> None:
        try:
            hasil_audio["v"] = audio_envelope(src, start, dur, SAMPLE_FPS,
                                              run_ffmpeg)
        except Exception as exc:
            print(f"[face-track] audio gagal: {str(exc)[:100]}")
            hasil_audio["v"] = None

    th_audio = threading.Thread(target=_ambil_audio, daemon=True)
    th_audio.start()

    proc = subprocess.Popen(
        ["nice", "-n", "10", "ffmpeg", "-v", "error",
         "-ss", f"{start:.3f}", "-t", f"{dur:.3f}", "-i", src,
         "-vf", f"scale={aw}:{ah}", "-r", str(SAMPLE_FPS),
         "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    def frame_berikut() -> Optional[np.ndarray]:
        assert proc.stdout is not None
        buf = proc.stdout.read(fb)
        if not buf or len(buf) < fb:
            return None
        return np.frombuffer(buf, dtype=np.uint8).reshape(ah, aw, 3)

    # Laporkan 0% SEKARANG: kalau tidak, UI diam sampai frame pertama tiba
    # (6 detik) dan pengguna melihat persen beku.
    if on_progress is not None:
        try:
            on_progress(0)
        except Exception:
            pass

    # Audio TIDAK ditunggu di sini. Menunggunya membuat jeda 12 detik sebelum
    # laporan kedua karena audio dan video berbagi bandwidth ke URL yang sama.
    # Gerbang audio hanya menekan skor saat senyap, jadi aman kalau baru aktif
    # setelah beberapa frame pertama: nilainya dijemput di dalam loop begitu
    # thread-nya selesai.
    audio = None

    # DENYUT SELAMA MENUNGGU FRAME PERTAMA.
    # Frame pertama butuh 6-12 detik (ffmpeg harus seek ke menit ke-20 lewat HTTP
    # range). Tanpa denyut ini, angka persen membeku selama itu dan pengguna
    # melihatnya sebagai proses yang macet — keluhan aslinya "4% mulu".
    # Denyut hanya bergerak 0->4% supaya tidak pernah mendahului kemajuan nyata.
    frame_pertama = threading.Event()

    def _denyut() -> None:
        i = 0
        while not frame_pertama.wait(1.2):
            i += 1
            if on_progress is None:
                continue
            try:
                on_progress(min(4, i))
            except Exception:
                pass

    threading.Thread(target=_denyut, daemon=True).start()

    tracker = ByteTracker()
    state: dict[str, Any] = {"uid": None, "hold": 0, "hold_uid": None,
                             "last_cut": -10 ** 6}
    targets: list[float] = []
    rolls: list[float] = []
    layout_frames: list[dict[str, Any]] = []
    cuts: set[int] = set()
    max_faces = 0
    switches = 0
    prev_small = None
    roll_s = 0.0

    fi = -1
    while True:
        frame = frame_berikut()
        if frame is None:
            break
        fi += 1
        frame_pertama.set()          # matikan denyut: kemajuan nyata sudah jalan
        # jemput hasil audio begitu thread-nya selesai (tidak memblokir)
        if audio is None and "v" in hasil_audio:
            audio = hasil_audio["v"]
        if on_progress is not None and (fi % 15 == 0):
            try:
                on_progress(min(99, int(fi / max(1, n - 1) * 100)))
            except Exception:
                pass

        small = frame[::16, ::16].mean(axis=2).astype(np.float32)
        scene_cut = (prev_small is not None
                     and float(np.abs(small - prev_small).mean()) > SCENE_CUT_DIFF)
        prev_small = small

        try:
            dets = face_yunet.detect(frame, min_face_ratio=0.03)
        except Exception as exc:
            print(f"[face-track] deteksi frame {fi} gagal: {exc}")
            dets = []
        live = tracker.update(dets, fi)
        max_faces = max(max_faces, len(live))

        for t in live:
            if not scene_cut:
                push_sample(t, fi, t["det"], frame_rgb=frame)
        commit_speak(tracker.all_tracks(), fi, audio, SAMPLE_FPS)

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
            layout_frames.append({"faces": []})
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

        # REKAM SEMUA WAJAH per frame untuk perencana AUTO LAYOUT.
        # Auto layout perlu tahu berapa orang yang tampak BERSAMA dan siapa yang
        # aktif — keputusan itu tidak bisa diambil dari `targets` (satu angka per
        # frame). Disimpan sebagai fraksi (0..1) supaya tidak bergantung resolusi
        # analisis, dan hanya wajah yang benar-benar terdeteksi frame ini.
        faces_frame: list[dict[str, float]] = []
        for t in live:
            if t.get("last") != fi:
                continue
            d = t.get("det") or {}
            faces_frame.append({
                "cx": round(float(t["cx"]) / max(1, aw), 4),
                "cy": round(float(t.get("cy") or ah / 2) / max(1, ah), 4),
                # kunci lebar wajah di YuNet adalah "fw" (bukan "w"). Salah nama
                # kunci membuat w_frac = 0 untuk SEMUA wajah, sehingga syarat
                # MIN_FACE_FRAC menolak seluruhnya dan auto layout tidak pernah
                # menemukan rentang multi-wajah (terukur: 0 rentang dari 163
                # frame yang jelas memuat dua orang).
                "w_frac": round(float(d.get("fw") or d.get("w") or 0)
                                / max(1, aw), 4),
                # SKOR MENTAH, bukan boolean. Ambang "aktif" untuk auto layout
                # BEDA dari ambang "sedang bicara" untuk memilih kamera: layout
                # split juga pantas muncul saat orang kedua tertawa atau bilang
                # "oh" — mulutnya bergerak tapi skornya di bawah SPEAK_ON.
                # Terukur pada podcast nyata: dengan ambang SPEAK_ON, frame yang
                # punya >=2 orang aktif = 0% dari 452 frame, jadi split tidak
                # pernah bisa muncul sama sekali. Ambangnya diputuskan di
                # auto_layout, bukan di sini.
                "speak": round(float(t.get("speak") or 0.0), 5),
            })
        layout_frames.append({"faces": faces_frame})

        # AFFINE DEROLL: sudut dari garis mata, dihaluskan dan dibatasi.
        r = float(act.get("roll") or 0.0)
        if abs(r) > MAX_ROLL_FIX:
            r = MAX_ROLL_FIX if r > 0 else -MAX_ROLL_FIX
        roll_s = roll_s * (1 - ROLL_EMA) + r * ROLL_EMA
        rolls.append(roll_s)

    # tutup pipe & tunggu ffmpeg supaya tidak ada proses menggantung
    frame_pertama.set()
    try:
        if proc.stdout is not None:
            proc.stdout.close()
        proc.wait(timeout=10)
    except Exception:
        proc.kill()
    if fi < 7:
        print(f"[face-track] frame terlalu sedikit ({fi + 1}) → crop tengah")
        return empty
    if on_progress is not None:
        try:
            on_progress(100)
        except Exception:
            pass

    crop_w = min(int(h * aspect), w)
    traj = build_trajectory(targets, cuts, w, crop_w, aw, SAMPLE_FPS)
    return {"trajectory": traj, "faces": max_faces, "switches": switches,
            "cuts": sorted(cuts), "analysis_fps": SAMPLE_FPS,
            "roll": [round(v, 3) for v in rolls], "engine": "yunet",
            "layout_frames": layout_frames}
