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

    # PENTING: daftar posisi ini di-INDEKS PER FRAME (None kalau frame itu tidak
    # punya pasangan), bukan dipadatkan. Versi lama hanya append saat pasangan
    # ada, sehingga `kiri_x[a:b+1]` mengambil sampel dari FRAME LAIN — median
    # posisi panel bisa berasal dari bagian video yang sama sekali berbeda.
    ok2: list[bool] = []
    kiri_x: list[Optional[float]] = []
    kanan_x: list[Optional[float]] = []
    kiri_cy: list[Optional[float]] = []
    kanan_cy: list[Optional[float]] = []
    # lebar wajah per orang: dipakai anti-bocor panel (geometri_panel_bersih)
    # untuk memperkirakan lebar badan orang di sebelahnya
    kiri_w: list[Optional[float]] = []
    kanan_w: list[Optional[float]] = []
    for i in range(n):
        pasangan = _pasang_kiri_kanan(frames, i, i, src_w)
        if pasangan:
            ok2.append(True)
            kiri, kanan = pasangan
            kiri_x.append(float(kiri.get("cx", 0.5)))
            kanan_x.append(float(kanan.get("cx", 0.5)))
            kiri_cy.append(float(kiri.get("cy", 0.45)))
            kanan_cy.append(float(kanan.get("cy", 0.45)))
            kiri_w.append(float(kiri.get("w_frac", 0.06)))
            kanan_w.append(float(kanan.get("w_frac", 0.06)))
        else:
            ok2.append(False)
            kiri_x.append(None)
            kanan_x.append(None)
            kiri_cy.append(None)
            kanan_cy.append(None)
            kiri_w.append(None)
            kanan_w.append(None)

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

        def med(xs: list[Optional[float]], bawaan: float) -> float:
            """Median dari sampel YANG ADA di rentang ini (None dilewati)."""
            v = [float(x) for x in xs if x is not None]
            return float(np.median(v)) if v else bawaan

        kiri_sampel = [x for x in kiri_x[a:b + 1] if x is not None]
        kanan_sampel = [x for x in kanan_x[a:b + 1] if x is not None]
        if not kiri_sampel or not kanan_sampel:
            continue
        out.append({
            "start": a / fps,
            "end": (b + 1) / fps,
            "kiri_cx": med(kiri_x[a:b + 1], 0.3),
            "kanan_cx": med(kanan_x[a:b + 1], 0.7),
            "kiri_cy": med(kiri_cy[a:b + 1], 0.45),
            "kanan_cy": med(kanan_cy[a:b + 1], 0.45),
            # lebar wajah masing-masing (fraksi lebar sumber) → anti-bocor panel
            "kiri_w": med(kiri_w[a:b + 1], 0.06),
            "kanan_w": med(kanan_w[a:b + 1], 0.06),
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

    ANTI-BOCOR: crop tiap panel dihitung dengan geometri_panel_bersih supaya
    lengan/baju orang di sebelahnya tidak ikut masuk. Kalau ruang cukup, hasilnya
    identik dengan crop dasar (aksi "utuh") — video yang orangnya berjauhan tidak
    berubah sama sekali.
    """
    kw = float(kanan.get("kanan_w", kiri.get("kanan_w", 0.06)) or 0.06)
    lw = float(kiri.get("kiri_w", kanan.get("kiri_w", 0.06)) or 0.06)
    w0, h0, x0, y0, half_h, aksi0 = geometri_panel_bersih(
        src_w, src_h, out_w, out_h,
        kiri["kiri_cx"], kiri["kiri_cy"],
        cx_lain=float(kanan["kanan_cx"]), w_frac_lain=kw, sisi="kiri",
        w_frac_diri=lw)
    w1, h1, x1, y1, _, aksi1 = geometri_panel_bersih(
        src_w, src_h, out_w, out_h,
        kanan["kanan_cx"], kanan["kanan_cy"],
        cx_lain=float(kiri["kiri_cx"]), w_frac_lain=lw, sisi="kanan",
        w_frac_diri=kw)
    la, lb = labels
    split_line = f"[{in_label}]split=2[{la}][{lb}]"
    part0 = (f"[{la}]crop=w={w0}:h={h0}:x={x0}:y={y0},"
             f"scale={out_w}:{half_h}[{la}p]")
    part1 = (f"[{lb}]crop=w={w1}:h={h1}:x={x1}:y={y1},"
             f"scale={out_w}:{half_h}[{lb}p]")
    vstack = (f"[{la}p][{lb}p]vstack=inputs=2,"
              f"pad={out_w}:{out_h}:0:0,setsar=1[{kanan.get('si', 0)}comp]")
    if aksi0 != "utuh" or aksi1 != "utuh":
        print(f"[auto-split] anti-bocor panel: atas={aksi0} bawah={aksi1}")
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


# --- ANTI-BOCOR PANEL (permintaan pengguna) ---
# Masalah nyata: dua orang duduk berdempetan, jadi crop panel orang PERTAMA
# masih memuat lengan/baju orang KEDUA. Solusinya bertingkat, meniru cara
# editor manusia: GESER dulu (murah, komposisi tetap lega), ZOOM hanya kalau
# geser tidak cukup.
#
# ATURAN YANG TIDAK BOLEH DILANGGAR (keluhan pengguna: "kok orangnya jadi
# terpotong?"): kepala orang yang jadi subjek panel WAJIB utuh di dalam crop.
# Lebih baik menerima sedikit bocor daripada memotong kepala subjek — bocor
# hanya mengganggu, kepala terpotong membuat klip tidak bisa dipakai.
BAHU_HALF = 1.15        # setengah lebar badan ≈ 1,15 × lebar wajah. Wajah saja
                        # tidak cukup: yang terlihat bocor justru bahu & lengan.
BOCOR_MARGIN = 0.012    # jarak aman tambahan (fraksi lebar sumber)
# Ruang minimum di kiri/kanan wajah SUBJEK, dinyatakan relatif LEBAR WAJAH
# (bukan lebar panel). Versi lama memakai 10% lebar panel; pada panel yang
# sudah di-zoom, 10% panel bisa lebih kecil dari setengah wajah sehingga
# kepala terpotong. Relatif lebar wajah selalu aman.
MARGIN_WAJAH = 0.85     # >= 0,85 × lebar wajah di kedua sisi wajah subjek
MAKS_ZOOM = 1.25        # batas zoom (1,55 terbukti memotong kepala pada uji
                        # t=1242s: crop menyusut sampai wajah menyentuh tepi).
                        # Di atas ini lebih baik terima bocor.


def geometri_panel_bersih(src_w: int, src_h: int, out_w: int, out_h: int,
                          cx: float, cy: float,
                          cx_lain: float, w_frac_lain: float,
                          sisi: str,
                          w_frac_diri: float = 0.0,
                          ) -> tuple[int, int, int, int, int, str]:
    """Crop panel yang TIDAK memuat orang lain: geser dulu, zoom kalau perlu.

    sisi="kiri"  → orang ini di kiri, orang lain di KANAN: tepi KANAN crop
                   dibatasi di pangkal badan orang lain.
    sisi="kanan" → sebaliknya.
    w_frac_diri  → lebar wajah SUBJEK (fraksi lebar sumber). Dipakai untuk
                   menjamin kepalanya tidak terpotong. 0 = tidak diketahui,
                   pakai perkiraan dari lebar wajah tetangga.

    Balik (w, h, x, y, half_h, aksi); aksi ∈ {"utuh","geser","zoom","batal"}.

    Cara kerja: hitung ruang horizontal yang BEBAS dari orang lain, lalu ambil
    jendela crop TERBESAR yang muat di ruang itu (rasio panel tetap),
    dipusatkan ke wajah. Kalau ruangnya sudah lebih lebar dari crop dasar,
    hasilnya sama seperti sebelumnya (aksi "utuh") — jadi video yang orangnya
    berjauhan tidak berubah sama sekali.

    PENJAGA KEPALA: kalau crop yang bebas-bocor ternyata terlalu sempit untuk
    memuat kepala subjek beserta marginnya, seluruh penyesuaian DIBATALKAN
    (aksi "batal") dan crop dasar dipakai. Memotong kepala subjek jauh lebih
    buruk daripada membiarkan bahu tetangga terlihat.
    """
    w0, h0, x0, y0, half_h = geometri_panel(src_w, src_h, out_w, out_h, cx, cy)
    aspect = w0 / float(h0) if h0 else 1.0

    occ = max(0.0, float(w_frac_lain)) * BAHU_HALF + BOCOR_MARGIN
    wajah_px = cx * src_w
    # lebar wajah subjek dalam piksel; kalau tidak diberi, pakai lebar wajah
    # tetangga sebagai perkiraan (dua orang dalam satu shot ukurannya mirip)
    wajah_w = max(8.0, (float(w_frac_diri) or float(w_frac_lain)) * src_w)
    # ruang yang WAJIB tersedia: wajah + margin di kedua sisi
    perlu = wajah_w * (1.0 + 2.0 * MARGIN_WAJAH)

    if sisi == "kiri":
        batas = (float(cx_lain) - occ) * src_w
        lo, hi = 0.0, min(float(src_w), max(0.0, batas))
    else:
        batas = (float(cx_lain) + occ) * src_w
        lo, hi = max(0.0, min(float(src_w), batas)), float(src_w)

    ruang = hi - lo
    # wajah subjek sendiri sudah di dalam wilayah orang lain → dua orang
    # bertumpuk; tidak ada crop yang bisa memisahkan mereka.
    if wajah_px < lo or wajah_px > hi:
        return w0, h0, x0, y0, half_h, "batal"
    # ruang bebas terlalu sempit untuk kepala subjek → JANGAN paksa.
    if ruang < perlu:
        return w0, h0, x0, y0, half_h, "batal"

    if ruang >= w0:
        # cukup ruang: tinggal geser (mungkin tidak perlu bergerak sama sekali)
        w, h = float(w0), float(h0)
        x = wajah_px - w / 2.0
        x = max(lo, min(x, hi - w))
        aksi = "utuh" if abs(x - x0) < 2 else "geser"
    else:
        # harus mengecilkan crop = zoom in. Dua batas sekaligus: MAKS_ZOOM
        # (jangan close-up ekstrem) dan `perlu` (jangan potong kepala).
        w_min = max(w0 / MAKS_ZOOM, perlu)
        if ruang < w_min:
            # tidak ada crop yang sekaligus bebas-bocor DAN aman untuk kepala
            return w0, h0, x0, y0, half_h, "batal"
        w = float(ruang)
        h = w / aspect
        if h > src_h:
            h = float(src_h)
            w = h * aspect
            if w > ruang:
                return w0, h0, x0, y0, half_h, "batal"
        x = wajah_px - w / 2.0
        x = max(lo, min(x, max(lo, hi - w)))
        aksi = "zoom"

    # PENJAGA KEPALA: wajah harus punya margin nyata di kedua sisi crop.
    tepi = wajah_w * MARGIN_WAJAH
    if wajah_px - x < tepi:
        x = wajah_px - tepi
    elif (x + w) - wajah_px < tepi:
        x = wajah_px + tepi - w
    # setelah digeser, crop tidak boleh keluar ruang bebas maupun keluar frame
    x = max(lo, min(x, hi - w))
    x = max(0.0, min(x, src_w - w))
    # verifikasi akhir: kalau margin tetap tidak terpenuhi, batalkan.
    if (wajah_px - x) < tepi * 0.9 or ((x + w) - wajah_px) < tepi * 0.9:
        return w0, h0, x0, y0, half_h, "batal"

    y = cy * src_h - h * 0.42
    y = max(0.0, min(y, src_h - h))

    wi = int(round(w)) - (int(round(w)) % 2)
    hi_ = int(round(h)) - (int(round(h)) % 2)
    xi = int(round(x)) - (int(round(x)) % 2)
    yi = int(round(y)) - (int(round(y)) % 2)
    xi = max(0, min(xi, src_w - wi))
    yi = max(0, min(yi, src_h - hi_))
    return wi, hi_, xi, yi, half_h, aksi


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
