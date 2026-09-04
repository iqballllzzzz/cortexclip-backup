"""AUTO SPLIT ala openshorts — pengganti auto_layout lama.

Sumber resep: /tmp/openshorts/split_layout.py + active_speaker.py
(diuji pada corpus 48 klip, akurasi 94-96%).

Perbedaan mendasar dari auto_layout.py lama:
  - TIDAK ADA fill/fit/three/four/gameplay/screenshare. Satu keputusan:
    SPLIT atau tidak. Kalau tidak → kamera (face tracking) seperti biasa.
  - Split = DUA panel (atas = orang kiri, bawah = orang kanan) dengan crop
    GEOMETRI BENAR: crop_h = src_h * 0.8, crop_w = crop_h * (out_w / half_h).
    Posisi orang = MEDIAN deteksi per rentang (anti frame melenceng).
  - Gerbang percakapan (active_speaker): jendela 0.4s, aktivitas mulut
    DINORMALISASI PER ORANG (p20-p80), gate audio, margin 0.15, min share 0.2.
    Satu orang pegang floor → JANGAN split (kamera saja).
  - RENTANG split dicatat untuk caption di seam (\\an5).

Yang TETAP dipakai dari pipeline lama: layout_frames (deteksi wajah per frame
dengan skor bicara), analysis_fps, dan trajektori kamera untuk bagian tanpa
split. Bagian split dirender SEPARATE ala openshorts (crop statis per orang).
"""
from __future__ import annotations

from typing import Any, Optional

import numpy as np

# --- ambang openshorts (diukur, bukan ditebak) ---
MIN_COEXISTENCE = 0.50   # >=50% sampel memuat dua wajah bersamaan
MIN_SEPARATION = 0.20    # jarak dua pusat wajah >=20% lebar frame
MIN_FACE_FRAC = 0.045    # wajah lebih kecil = extras/penonton
MIN_SPLIT_S = 2.5        # split lebih pendek dari ini = glitch, bukan pilihan
SPLIT_TIGHTNESS = 0.80   # tinggi crop = 80% sumber (bukan 100%, supaya bahu
                         # tetangga tidak ikut terlihat)

# --- gerbang pembicara (active_speaker.py) ---
JENDELA_S = 0.40         # satu window = 0.4 detik
AUDIO_GATE = 0.18        # di bawah ini = tidak ada yang bicara
MIN_MARGIN = 0.15        # selisih aktivitas <15% = tidak jelas siapa bicara
MIN_SHARE = 0.20         # kedua pembicara masing-masing >=20% window
HOLD_WINDOWS = 3         # pembicara baru harus menang 3 window berturut
MIN_SEG_S = 1.0          # segmen bicara lebih pendek dari ini dilebur

# aktifitas mulut: pakai skor bicara dari face_speak (sudah dinormalisasi
# simpangan bukaan mulut per wajah). Normalisasi p20-p80 diterapkan lagi di
# sini supaya dua orang dengan kontras/pencahayaan berbeda adil.
SAMPLE_S = 1.0 / 15.0    # layout_frames direkam 15 fps


def _wajah_besar(faces: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Wajah yang cukup besar untuk jadi tokoh (bukan extras)."""
    return [f for f in faces if float(f.get("w_frac", 0)) >= MIN_FACE_FRAC]


def _pasang_kiri_kanan(frames: list[dict[str, Any]], i: int, j: int,
                       src_w: int) -> Optional[tuple[dict[str, Any], dict[str, Any]]]:
    """Dua wajah terbesar pada frame i, urut kiri→kanan; None kalau tidak cocok.

    Syarat openshorts: kedua wajah bersama, jarak horizontal >= MIN_SEPARATION.
    """
    fs = _wajah_besar(frames[i].get("faces", []))
    if len(fs) < 2:
        return None
    fs = sorted(fs, key=lambda f: -float(f.get("w_frac", 0)))[:2]
    fs = sorted(fs, key=lambda f: float(f.get("cx", 0.5)))
    kiri, kanan = fs[0], fs[1]
    jarak = abs(float(kanan.get("cx", 0)) - float(kiri.get("cx", 0)))
    if jarak < MIN_SEPARATION:
        return None
    return kiri, kanan


def deteksi_rentang_split(frames: list[dict[str, Any]], fps: float,
                          src_w: int) -> list[dict[str, Any]]:
    """Rentang [start_detik, end_detik, kiri, kanan] yang layak di-split.

    Langkah openshorts (detect_split_scenes + analyze_scene):
      1. berkelah frame: frame punya 2 wajah besar yang terpisah cukup → sampel
         kiri/kanan masuk kandidat;
      2. celah deteksi 1-2 frame TIDAK memutus rentang (detektor bolong saat
         kepala menoleh — komentar openshorts tentang BlazeFace profil);
      3. co-existence: >=MIN_COEXISTENCE dari rentang benar-benar memuat dua
         wajah — memisahkan two-shot sungguhan dari plano/contraplano (dua
         kamera bergantian, masing-masing satu orang, TIDAK boleh di-split);
      4. durasi >= MIN_SPLIT_S;
      5. posisi kiri/kanan = MEDIAN semua sampel (median, bukan mean — komentar
         openshorts: satu frame deteksi nyasar tidak menggeser crop).
    """
    if not frames:
        return []
    n = len(frames)

    ok2: list[bool] = []
    kiri_x: list[float] = []
    kanan_x: list[float] = []
    kiri_cy: list[float] = []
    kanan_cy: list[float] = []
    for i in range(n):
        pasangan = _pasang_kiri_kanan(frames, i, i, src_w)
        if pasangan:
            ok2.append(True)
            kiri, kanan = pasangan
            kiri_x.append(float(kiri.get("cx", 0.5)))
            kanan_x.append(float(kanan.get("cx", 0.5)))
            kiri_cy.append(float(kiri.get("cy", 0.45)))
            kanan_cy.append(float(kanan.get("cy", 0.45)))
        else:
            ok2.append(False)

    # tutup celah pendek (detektor bolong saat menoleh) — 0.6 detik
    gap = max(1, int(fps * 0.6))
    tutup = list(ok2)
    i = 0
    while i < n:
        if ok2[i]:
            i += 1
            continue
        j = i
        while j < n and not ok2[j]:
            j += 1
        if i > 0 and j < n and (j - i) <= gap:
            for k in range(i, j):
                tutup[k] = True
        i = j

    # kelompokkan rentang berturut-turut
    rentang: list[tuple[int, int]] = []
    i = 0
    while i < n:
        if not tutup[i]:
            i += 1
            continue
        j = i
        while j + 1 < n and tutup[j + 1]:
            j += 1
        panjang = j - i + 1
        if panjang >= fps * MIN_SPLIT_S:
            rentang.append((i, j))
        i = j + 1

    out: list[dict[str, Any]] = []
    for a, b in rentang:
        # co-existence pada rentang yang sudah ditutup celahnya
        bersama = sum(1 for k in range(a, b + 1) if ok2[k])
        if bersama / max(1, b - a + 1) < MIN_COEXISTENCE:
            continue
        def med(xs: list[float]) -> float:
            return float(np.median(xs)) if xs else 0.5
        kiri_sampel = kiri_x[a:b + 1]
        kanan_sampel = kanan_x[a:b + 1]
        if not kiri_sampel or not kanan_sampel:
            continue
        out.append({
            "start": a / fps,
            "end": (b + 1) / fps,
            "kiri_cx": med(kiri_sampel),
            "kanan_cx": med(kanan_sampel),
            "kiri_cy": med(kiri_cy[a:b + 1]) if kiri_cy[a:b + 1] else 0.45,
            "kanan_cy": med(kanan_cy[a:b + 1]) if kanan_cy[a:b + 1] else 0.45,
            "co_existence": bersama / max(1, b - a + 1),
        })
    return out


def aktivitas_mulut(frames: list[dict[str, Any]], fps: float,
                    a: int, b: int) -> list[list[float]]:
    """Aktivitas mulut per window [[kiri, kanan], ...] pada rentang [a,b].

    openshorts pakai magnitude frame-difference pada ROI mulut; CortexClip
    sudah punya skor mulut FaceMesh yang lebih baik (simpangan bukaan mulut).
    Agregasi per window supaya bentuknya sama dengan resep openshorts.
    """
    n_window = max(1, int(round((b - a + 1) / fps / JENDELA_S)))
    win = (b - a + 1) / n_window
    kolom: list[list[float]] = []
    for w in range(n_window):
        i0 = a + int(w * win)
        i1 = a + int((w + 1) * win)
        kiri = kanan = 0.0
        for i in range(i0, min(i1, b + 1)):
            fs = _wajah_besar(frames[i].get("faces", []))
            fs = sorted(fs, key=lambda f: float(f.get("cx", 0.5)))
            if len(fs) >= 2:
                kiri = max(kiri, float(fs[0].get("speak", 0) or 0))
                kanan = max(kanan, float(fs[1].get("speak", 0) or 0))
            elif len(fs) == 1:
                # satu wajah terdeteksi: pakai posisi untuk memilih kolom
                if float(fs[0].get("cx", 0.5)) < 0.5:
                    kiri = max(kiri, float(fs[0].get("speak", 0) or 0))
                else:
                    kanan = max(kanan, float(fs[0].get("speak", 0) or 0))
        kolom.append([kiri, kanan])
    return kolom


def _normalisasi_per_orang(kolom: list[list[float]]) -> list[list[float]]:
    """Normalisasi p20-p80 per kolom (openshorts normalise_activity).

    Raw skor tidak bisa dibandingkan antar wajah: skala mengikuti kontras dan
    ukuran kotak, sehingga orang yang lebih terang menang semua window.
    """
    if not kolom:
        return kolom
    arr = np.asarray(kolom, dtype=float)
    if arr.ndim != 2 or arr.shape[1] < 2:
        return kolom
    low = np.percentile(arr, 20, axis=0)
    high = np.percentile(arr, 80, axis=0)
    spread = np.where(high - low > 1e-9, high - low, 1.0)
    return np.clip((arr - low) / spread, 0.0, None).tolist()


def atribusi_window(kolom: list[list[float]],
                    audio: Optional[list[float]] = None) -> list[Optional[int]]:
    """Siapa pemilik tiap window (0=kiri, 1=kanan, None=tidak jelas)."""
    verdicts: list[Optional[int]] = []
    for i, pasangan in enumerate(kolom):
        if audio and i < len(audio) and float(audio[i]) < AUDIO_GATE:
            verdicts.append(None)
            continue
        a, b_ = float(pasangan[0]), float(pasangan[1])
        total = a + b_
        if total <= 0:
            verdicts.append(None)
            continue
        margin = abs(a - b_) / total
        verdicts.append(None if margin < MIN_MARGIN else (0 if a > b_ else 1))
    return verdicts


def share(verdicts: list[Optional[int]]) -> tuple[float, float]:
    dihitung = [v for v in verdicts if v is not None]
    if not dihitung:
        return 0.0, 0.0
    n = float(len(dihitung))
    return dihitung.count(0) / n, dihitung.count(1) / n


def is_percakapan(verdicts: list[Optional[int]]) -> bool:
    a, b_ = share(verdicts)
    return min(a, b_) >= MIN_SHARE


def pegangan(verdicts: list[Optional[int]],
             min_windows: int = HOLD_WINDOWS) -> list[Optional[int]]:
    """Anti-flap: pembicara baru harus menang min_windows berturut-turut.

    openshorts hold(): window tidak jelas mewarisi pembicara sekarang; balikan
    di-backfill dengan pembicara pertama supaya tidak ada window tanpa kamera.
    """
    out: list[Optional[int]] = []
    current: Optional[int] = None
    pending: Optional[int] = None
    run = 0
    for v in verdicts:
        if v is None or v == current:
            if v == current:
                pending, run = None, 0
            out.append(current)
            continue
        if v == pending:
            run += 1
        else:
            pending, run = v, 1
        if current is None or run >= min_windows:
            current, pending, run = v, None, 0
        out.append(current)
    if all(v is None for v in out):
        return out
    first = next(v for v in out if v is not None)
    return [first if v is None else v for v in out]


def split_filtergraph_parts(src_w: int, src_h: int, out_w: int, out_h: int,
                            kiri: dict[str, Any], kanan: dict[str, Any],
                            labels: tuple[str, str] = ("as0", "as1"),
                            in_label: str = "0:v"
                            ) -> tuple[str, str, str, str]:
    """Versi berlabel dari split_filtergraph untuk filter_complex bertingkat.

    Balik (split_line, rantai_kiri, rantai_kanan, vstack). split_line memecah
    input menjadi dua salinan panel; TANPA baris itu label panel tak pernah
    didefinisikan dan ffmpeg keluar 234 ("unconnected input") — bug yang
    menghentikan preview pertama kali.
    """
    w0, h0, x0, y0, half_h = geometri_panel(
        src_w, src_h, out_w, out_h, kiri["kiri_cx"], kiri["kiri_cy"])
    w1, h1, x1, y1, _ = geometri_panel(
        src_w, src_h, out_w, out_h, kanan["kanan_cx"], kanan["kanan_cy"])
    la, lb = labels
    split_line = f"[{in_label}]split=2[{la}][{lb}]"
    part0 = (f"[{la}]crop=w={w0}:h={h0}:x={x0}:y={y0},"
             f"scale={out_w}:{half_h}[{la}p]")
    part1 = (f"[{lb}]crop=w={w1}:h={h1}:x={x1}:y={y1},"
             f"scale={out_w}:{half_h}[{lb}p]")
    vstack = (f"[{la}p][{lb}p]vstack=inputs=2,"
              f"pad={out_w}:{out_h}:0:0,setsar=1[{kanan.get('si', 0)}comp]")
    return split_line, part0, part1, vstack


def rencana_auto_split(st: dict[str, Any],
                       audio: Optional[list[float]] = None,
                       src_w: int = 0) -> dict[str, Any]:
    """Rencana lengkap satu klip: rentang split + rentang kamera + giliran bicara.

    st = hasil analyze_speaker_track (layout_frames + analysis_fps + trajectory).
    Balik:
      {
        "splits": [{start, end, kiri_cx, kanan_cx, kiri_cy, kanan_cy, giliran}],
        "cut_x": [[t, x_px], ...]  # ganti kamera LANGSUNG (hard cut) di luar split
      }
    giliran = daftar (t_awal, t_akhir, 0|1) — siapa bicara dalam rentang split,
    dipakai caption & (kalau ingin) pemilihan panel aktif.
    """
    frames = st.get("layout_frames") or []
    fps = float(st.get("analysis_fps") or 15.0)
    if not src_w:
        src_w = int(st.get("src_w") or 0)
    if not src_w:
        # TANPA src_w semua ambang fraksi lebar (MIN_SEPARATION, geometri
        # panel) tidak bermakna. Terbukti: camera_track tanpa src_w menghasilkan
        # rentang split 4.2-10.3 yang SALAH, sementara dengan src_w=640 rencana
        # benar 15.3-22.7. Lebih baik tidak split daripada split di waktu salah.
        print("[auto-split] src_w tidak ada → lewati (tanpa split)")
        return {"splits": [], "cut_x": []}

    # audio envelope dari pipeline: 15 sampel/detik → agregasi ke window 0.4s
    audio_raw = st.get("audio") or None
    audio_window: Optional[list[float]] = None
    if audio_raw and len(audio_raw) > 8:
        n_window = int(round(len(audio_raw) * SAMPLE_S / JENDELA_S))
        if n_window > 4:
            per = len(audio_raw) / n_window
            audio_window = [
                max(audio_raw[int(w * per):max(int((w + 1) * per), int(w * per) + 1)])
                for w in range(n_window)
            ]

    splits = deteksi_rentang_split(frames, fps, src_w)
    hasil_splits: list[dict[str, Any]] = []
    cut_x: list[tuple[float, int]] = []

    for s in splits:
        a = int(s["start"] * fps)
        b = min(len(frames) - 1, int(s["end"] * fps) - 1)
        kolom = aktivitas_mulut(frames, fps, a, b)
        kolom = _normalisasi_per_orang(kolom)
        # sejajarkan audio window dengan kolom aktivitas
        audio_w = None
        if audio_window:
            offset = int(s["start"] / JENDELA_S)
            audio_w = audio_window[offset:offset + len(kolom)] or None
        verdicts = atribusi_window(kolom, audio_w)
        if not is_percakapan(verdicts):
            # satu orang pegang floor → JANGAN split (openshorts: "not stacking")
            continue
        giliran = pegangan(verdicts)
        # segmen giliran yang dipegang seseorang
        seg_giliran: list[tuple[float, float, int]] = []
        for w, v in enumerate(giliran):
            if v is None:
                continue
            t0 = s["start"] + w * JENDELA_S
            t1 = min(s["end"], t0 + JENDELA_S)
            if seg_giliran and seg_giliran[-1][2] == v:
                seg_giliran[-1] = (seg_giliran[-1][0], t1, v)
            else:
                seg_giliran.append((t0, t1, v))
        # lebur segmen < MIN_SEG_S ke tetangganya
        rapi: list[list[Any]] = []
        for t0, t1, v in seg_giliran:
            if rapi and (t1 - t0) < MIN_SEG_S:
                rapi[-1][1] = t1
                continue
            rapi.append([t0, t1, v])
        hasil_splits.append({
            **s,
            "giliran": [(t0, t1, v) for t0, t1, v in rapi],
        })

    return {"splits": hasil_splits, "cut_x": cut_x}


def geometri_panel(src_w: int, src_h: int, out_w: int, out_h: int,
                   cx: float, cy: float) -> tuple[int, int, int, int, int]:
    """Crop box satu panel (w, h, x, y) + half_h — persis openshorts.

    crop_h = src_h * SPLIT_TIGHTNESS (0.8): bukan seluruh tinggi, supaya bahu
    orang di sebelahnya tidak ikut masuk. crop_w = crop_h * rasio half-frame.
    y diberi bias 0.42 agar kepala tidak terkubur di tepi bawah.
    """
    half_h = out_h // 2
    half_h -= half_h % 2
    aspect = out_w / float(half_h)

    crop_h = int(round(src_h * max(0.3, min(SPLIT_TIGHTNESS, 1.0))))
    crop_w = int(round(crop_h * aspect))
    if crop_w > src_w:
        crop_w = src_w
        crop_h = int(round(crop_w / aspect))
    crop_w -= crop_w % 2
    crop_h -= crop_h % 2

    x = int(round(cx * src_w - crop_w / 2.0))
    x = max(0, min(x, src_w - crop_w))
    y = int(round(cy * src_h - crop_h * 0.42))
    y = max(0, min(y, src_h - crop_h))
    return crop_w, crop_h, x - (x % 2), y - (y % 2), half_h


def split_filtergraph(src_w: int, src_h: int, out_w: int, out_h: int,
                      kiri: dict[str, Any], kanan: dict[str, Any]) -> str:
    """vstack dua crop statis — sama bentuknya dengan openshorts split_filtergraph.

    Atas = orang kiri (urutan layar-sungguhan; komentar openshorts: keying off
    siapa bicara duluan akan menukar panel antar scene, terlihat seperti salah
    potong).
    """
    w0, h0, x0, y0, half_h = geometri_panel(
        src_w, src_h, out_w, out_h, kiri["kiri_cx"], kiri["kiri_cy"])
    w1, h1, x1, y1, _ = geometri_panel(
        src_w, src_h, out_w, out_h, kanan["kanan_cx"], kanan["kanan_cy"])
    return (
        f"[0:v]split=2[ta][ba];"
        f"[ta]crop=w={w0}:h={h0}:x={x0}:y={y0},"
        f"scale={out_w}:{half_h}[top];"
        f"[ba]crop=w={w1}:h={h1}:x={x1}:y={y1},"
        f"scale={out_w}:{half_h}[bot];"
        f"[top][bot]vstack=inputs=2,"
        f"pad={out_w}:{out_h}:0:0,setsar=1[v]"
    )
