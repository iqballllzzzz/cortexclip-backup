"""UJI NYATA: manual tracking — pilih subjek dari layout_frames.

Membangun layout_frames sintetis (2 wajah bergerak berlawanan), menembak
trajektori_subjek() dengan klik pada wajah A, dan memastikan:
  - trajektori mengikuti WAJAH A (bukan B) di seluruh rentang
  - lubang deteksi diisi interpolasi
  - gabungkan_manual() menimpa trajektori otomatis pada rentang scene

Jalankan: backend/.venv/bin/python test-manual-track.py
"""
from __future__ import annotations

import sys

from app.manual_track import (gabungkan_manual, trajektori_subjek,
                              _isi_lubang)

FPS = 15.0


def buat_frames(n: int = 30):
    """Wajah A bergerak 0.30→0.50, wajah B bergerak 0.70→0.60."""
    frames = []
    for i in range(n):
        a_cx = 0.30 + 0.20 * i / (n - 1)
        b_cx = 0.70 - 0.10 * i / (n - 1)
        faces = [
            {"cx": round(a_cx, 4), "cy": 0.25, "w_frac": 0.10},
            {"cx": round(b_cx, 4), "cy": 0.28, "w_frac": 0.12},
        ]
        if i in (5, 6):          # lubang deteksi
            faces = []
        frames.append({"faces": faces})
    return frames


def main() -> int:
    gagal = 0

    def cek(nama: str, kondisi: bool, detail: str = "") -> None:
        nonlocal gagal
        print(f"  {nama:44} → {'OK' if kondisi else 'SALAH ' + detail}")
        if not kondisi:
            gagal += 1

    frames = buat_frames()
    print("[uji] trajektori_subjek — klik wajah A (cx=0.32):")
    t = trajektori_subjek(frames, FPS, (0.32, 0.25), 0.0, 2.0, src_w=640)
    cek("trajektori tidak kosong", bool(t))
    # 30 frames tersedia → 0..29 = 30 titik untuk 2s @15fps
    cek("jumlah titik = 30 (frames tersedia)", len(t.get("x", [])) == 30,
        f"got {len(t.get('x', []))}")
    xs = t.get("x", [])
    # frame 0: wajah A di 0.30 → px = 0.30*640 = 192 (±smoothing)
    cek("awal mengikuti wajah A (≈192px)", abs(xs[0] - 192) < 6,
        f"got {xs[0]:.1f}")
    # frame 28: A = 0.30+0.20*28/29 = 0.493 → 315px; B = 0.603 → 386px.
    # ikut A berarti dekat 315, BUKAN 386 (kalau 386 → salah ikut B).
    cek("akhir mengikuti wajah A (≈315px, bukan B 386px)",
        abs(xs[28] - 315) < 10, f"got {xs[28]:.1f}")
    # lubang frame 5-6 diisi (bukan -1)
    cek("lubang deteksi terisi", all(v >= 0 for v in xs),
        f"negatif di {[i for i,v in enumerate(xs) if v<0]}")

    print("[uji] _isi_lubang:")
    isi = _isi_lubang([100.0, None, None, 200.0], 0.0)
    cek("interpolasi tengah", isi == [100.0, 133.33, 166.67, 200.0]
        or abs(isi[1] - 133.33) < 0.1, f"got {isi}")
    tepi = _isi_lubang([None, None, 50.0, None], 9.0)
    cek("tepi memakai deteksi terdekat", tepi == [50.0, 50.0, 50.0, 50.0],
        f"got {tepi}")

    print("[uji] gabungkan_manual:")
    st = {"trajectory": [100.0] * 45, "cuts": [], "analysis_fps": FPS}
    ct = {"manual": {"scenes": [{
        "start": 1.0, "end": 2.0, "x": [500.0] * 15, "fps": FPS}]}}
    traj, cuts = gabungkan_manual(st, ct)
    cek("rentang manual menimpa otomatis",
        all(v == 500.0 for v in traj[15:30]) and traj[0] == 100.0,
        f"got {traj[14:16]}")
    cek("cut ditambahkan di awal scene", 15 in cuts, f"got {cuts}")

    # tanpa manual → apa adanya
    traj2, cuts2 = gabungkan_manual(st, {})
    cek("tanpa manual → trajektori asli", traj2 == [100.0] * 45)
    cek("tanpa manual → cuts kosong", cuts2 == [])

    if gagal:
        print(f"[uji] GAGAL: {gagal}")
        return 1
    print("[uji] SEMUA lulus")
    return 0


if __name__ == "__main__":
    sys.exit(main())
