"""Bagian 4 speaker_track: fungsi utama yang dipanggil pipeline render.

Analisis berjalan pada 15 fps karena bicara berlangsung 3-4 suku kata per detik;
5 fps berada di batas Nyquist sehingga gerak mulut teraliasing. FaceMesh cukup
murah untuk itu (~8 ms/frame pada 640x360 dengan 3 wajah).
"""
from __future__ import annotations

from typing import Any

import numpy as np

from .speaker_detect import commit_speak, get_mesh, track_frame
from .speaker_pick import build_trajectory, pick_active
from .speaker_track import SAMPLE_FPS, SCENE_CUT_DIFF


def analyze(src: str, start: float, end: float, *, probe_size, run_ffmpeg,
            aspect: float, analysis_width: int = 640,
            max_seconds: float = 180.0, **_ignored) -> dict[str, Any]:
    """Trajektori kamera yang selalu terpusat pada wajah pembicara.

    Balik {"trajectory", "faces", "switches", "cuts", "analysis_fps"}.
    probe_size & run_ffmpeg disuntikkan dari app.render supaya modul ini bisa
    diuji sendiri tanpa memuat seluruh pipeline render.
    """
    empty = {"trajectory": [], "faces": 0, "switches": 0, "cuts": [],
             "analysis_fps": SAMPLE_FPS}
    try:
        w, h = probe_size(src)
    except Exception as exc:
        print(f"[speaker-track] probe_size gagal: {exc}")
        return empty

    dur = min(end - start, max_seconds)
    if dur <= 0.3:
        # start==end atau rentang tak masuk akal: ffmpeg `-t 0` justru mendekode
        # SELURUH berkas, dan trajektori sepanjang itu akan dipakai untuk klip
        # yang durasinya lain → framing kacau. Lebih baik crop tengah.
        print(f"[speaker-track] durasi tidak valid ({dur:.2f}s) → crop tengah")
        return empty
    analysis_h = max(180, int(analysis_width * h / w / 2) * 2)
    analysis_w = int(analysis_h * w / h / 2) * 2
    try:
        raw = run_ffmpeg(["ffmpeg", "-v", "error",
                          "-ss", f"{start:.3f}", "-t", f"{dur:.3f}", "-i", src,
                          "-vf", f"scale={analysis_w}:{analysis_h}",
                          "-r", str(SAMPLE_FPS), "-f", "rawvideo",
                          "-pix_fmt", "rgb24", "-"], timeout=900).stdout
    except Exception as exc:
        print(f"[speaker-track] decode frame gagal: {exc}")
        return empty

    fb = analysis_w * analysis_h * 3
    n = len(raw) // fb
    if n < 8:
        print(f"[speaker-track] frame terlalu sedikit ({n}) → crop tengah")
        return empty
    frames = np.frombuffer(raw[: n * fb], dtype=np.uint8).reshape(
        n, analysis_h, analysis_w, 3)

    mesh = get_mesh()
    tracks: list[dict[str, Any]] = []
    retired: list[dict[str, Any]] = []
    next_uid = [1]
    state: dict[str, Any] = {"uid": None, "hold": 0, "hold_uid": None,
                             "last_cut": -10 ** 6}
    targets: list[float] = []
    cuts: set[int] = set()
    max_faces = 0
    switches = 0
    prev_small = None

    for fi in range(n):
        # potongan adegan: seluruh gambar berganti → landmark melompat dan semua
        # wajah tampak bicara, jadi frame ini tidak dipakai untuk menilai bicara
        small = frames[fi][::16, ::16].mean(axis=2).astype(np.float32)
        scene_cut = (prev_small is not None
                     and float(np.abs(small - prev_small).mean()) > SCENE_CUT_DIFF)
        prev_small = small

        live = track_frame(frames[fi], mesh, tracks, retired, fi, SAMPLE_FPS,
                           next_uid, freeze=scene_cut)
        max_faces = max(max_faces, len(live))
        commit_speak(tracks, fi)
        if scene_cut:
            # Video SUMBER berganti sudut kamera: wajah melompat ke tempat lain
            # seketika. Kalau di frame ini terlihat TEPAT SATU wajah, tidak ada
            # keraguan siapa yang harus disorot — lepaskan kuncian identitas
            # supaya kamera langsung ke sana. Terukur pada podcast nyata: tanpa
            # ini kamera menatap ruang kosong 0,4-0,6 detik setiap potongan
            # (error 83-91% lebar crop, 5 kejadian dalam 30 detik).
            #
            # Kalau wajah yang terlihat lebih dari satu, JANGAN dilepas: pada
            # panel 3 orang pemilihan ulang jatuh ke wajah yang bukan pembicara
            # dan kamera terkunci di sana (uji sintetis 100% → 33%).
            segar = [t for t in live if t["last"] == fi]
            if len(segar) == 1:
                state["uid"] = None
                state["hold"] = 0
                cuts.add(fi)
                live = segar
        act, is_cut = pick_active(live, state, fi, SAMPLE_FPS,
                                  all_tracks=tracks)
        if act is None:
            # tidak ada wajah: pertahankan posisi terakhir (jangan ke tengah)
            targets.append(targets[-1] if targets else analysis_w / 2)
            continue
        if is_cut:
            cuts.add(fi)
            switches += 1
        targets.append(act["cx"])

    crop_w = min(int(h * aspect), w)
    traj = build_trajectory(targets, cuts, w, crop_w, analysis_w, SAMPLE_FPS)
    return {"trajectory": traj, "faces": max_faces, "switches": switches,
            "cuts": sorted(cuts), "analysis_fps": SAMPLE_FPS}
