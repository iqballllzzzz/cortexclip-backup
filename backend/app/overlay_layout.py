"""Tata letak overlay CERDAS: ikon & b-roll tidak menutupi wajah atau subtitle.

MASALAH YANG DIPERBAIKI (keluhan pengguna)
1. "kadang ikon tuh muncul di tengah-tengah nutupin wajah"
2. "pastiin b-roll nya itu gak nutupin wajah atau subtitle juga, kalau kedeteksi
   nutupin maka bakal geser"
3. "kasih jarak juga b-roll dan ikon itu di waktu yang berbeda, misal kalau ikon
   di waktu 0.16 terus b-roll di 0.22"

CARA KERJA
Posisi wajah di frame KELUARAN dihitung dari data yang sudah ada:
`layout_frames` (cx, cy, lebar wajah per frame, dalam fraksi SUMBER) dipetakan
lewat jendela crop kamera (trajectory + crop_w) ke koordinat keluaran 9:16.
Jadi ini bukan tebakan "wajah biasanya di atas" — posisinya diukur per momen.

Untuk setiap overlay dicari kandidat posisi (kanan-atas, kiri-atas, kanan-bawah,
dst.). Kandidat yang bertumpang-tindih dengan kotak wajah atau band subtitle
dibuang; yang tersisa diurutkan berdasarkan jarak dari wajah. Kalau semua
kandidat bertabrakan (wajah besar close-up), dipilih yang tumpang-tindihnya
PALING KECIL — lebih baik sedikit menyenggol daripada tepat di wajah.

Waktu ikon dan b-roll dipisah: b-roll digeser setelah ikon (JEDA_IKON_BROLL)
sehingga tidak pernah muncul bersamaan.
"""
from __future__ import annotations

from typing import Any, Optional

# --- ambang tata letak ---
JEDA_IKON_BROLL = 0.55   # detik: b-roll muncul setelah ikonnya, bukan bersamaan
MIN_BROLL_S = 1.2        # b-roll lebih pendek dari ini terasa seperti glitch
PAD_WAJAH = 0.02         # jarak aman dari kotak wajah (fraksi tinggi keluaran)
PAD_SUBTITLE = 0.02      # jarak aman dari band subtitle
TINGGI_SUBTITLE = 0.13   # tinggi band subtitle (fraksi tinggi) — 2 baris + stroke
# Kotak "jangan tutupi" = KEPALA + LEHER, bukan seluruh badan. Angka lama
# (1.9 x 2.6) terukur salah: pada close-up (wajah 41% lebar keluaran) kotaknya
# jadi 107% TINGGI FRAME — seluruh layar dianggap terlarang, sehingga pemilih
# posisi kehilangan makna dan ikon jatuh di tempat dengan tumpang 70%.
WAJAH_LEBAR_X = 1.25     # kotak selebar 1,25x lebar wajah
WAJAH_TINGGI_Y = 1.60    # dan setinggi 1,6x lebar wajah (kepala + sedikit leher)
# b-roll boleh MENGECIL kalau tidak ada ruang bersih pada ukuran penuh —
# lebih baik jendela lebih kecil daripada menutupi wajah pembicara.
SKALA_BROLL = (1.0, 0.82, 0.66, 0.55, 0.45)
# Menutupi SUBTITLE lebih merugikan daripada menyenggol wajah: teks yang
# tertutup langsung tidak terbaca, sedangkan wajah tersenggol sedikit masih
# bisa diterima. Jadi tumpang dengan band subtitle diberi bobot lebih berat
# saat memilih posisi.
BOBOT_SUBTITLE = 4.0


def _kotak(cx: float, cy: float, w: float, h: float) -> tuple[float, float, float, float]:
    """(x0, y0, x1, y1) dari pusat + ukuran, semuanya fraksi frame."""
    return cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2


def _tumpang(a: tuple[float, float, float, float],
             b: tuple[float, float, float, float]) -> float:
    """Luas tumpang-tindih dua kotak (fraksi²). 0 = tidak bersinggungan."""
    x0 = max(a[0], b[0])
    y0 = max(a[1], b[1])
    x1 = min(a[2], b[2])
    y1 = min(a[3], b[3])
    if x1 <= x0 or y1 <= y0:
        return 0.0
    return (x1 - x0) * (y1 - y0)


def wajah_keluaran(st: dict[str, Any], t: float,
                   split_ranges: Optional[list[dict[str, Any]]] = None
                   ) -> list[tuple[float, float, float]]:
    """Kotak wajah pada detik `t` dalam koordinat KELUARAN (fraksi 0-1).

    Balik [(cx, cy, w_frac_keluaran), ...].

    Pemetaan: kamera memotong jendela selebar `crop_w` (tinggi penuh) pada
    posisi trajectory, lalu diskalakan ke frame keluaran. Maka:
        cx_out = (cx_src * src_w - crop_x) / crop_w
        cy_out = cy_src                      (tinggi tidak dipotong)
        w_out  = w_frac_src * src_w / crop_w (wajah jadi RELATIF lebih besar)

    Di dalam rentang split, layar dibagi dua panel — wajah ada di tengah
    masing-masing panel (0.5, 0.25) dan (0.5, 0.75).
    """
    for s in (split_ranges or []):
        if float(s.get("start", 0)) <= t <= float(s.get("end", 0)):
            return [(0.5, 0.25, 0.30), (0.5, 0.75, 0.30)]

    frames = st.get("layout_frames") or []
    if not frames:
        return []
    fps = float(st.get("analysis_fps") or 15.0)
    src_w = int(st.get("src_w") or 0)
    crop_w = int(st.get("crop_w") or 0) or src_w
    if not src_w or not crop_w:
        return []

    i = int(round(t * fps))
    i = max(0, min(len(frames) - 1, i))
    fs = frames[i].get("faces") or []
    if not fs:
        return []

    traj = st.get("trajectory") or []
    if traj:
        j = max(0, min(len(traj) - 1, i))
        crop_x = float(traj[j])
    else:
        crop_x = (src_w - crop_w) / 2.0

    out: list[tuple[float, float, float]] = []
    for f in fs:
        w_src = float(f.get("w_frac", 0) or 0)
        if w_src < 0.03:
            continue
        cx_out = (float(f.get("cx", 0.5)) * src_w - crop_x) / crop_w
        if not (-0.15 <= cx_out <= 1.15):
            continue        # wajah di luar jendela kamera → tidak terlihat
        cy_out = float(f.get("cy", 0.4))
        w_out = w_src * src_w / crop_w
        out.append((min(1.0, max(0.0, cx_out)), cy_out, w_out))
    return out


def band_subtitle(position_pct: float, di_split: bool) -> tuple[float, float, float, float]:
    """Kotak yang ditempati subtitle (fraksi frame).

    Di rentang split, subtitle pindah ke garis batas (0.5) — lihat
    subtitles.build_ass(split_ranges). Band-nya harus ikut pindah, kalau tidak
    overlay akan dijauhkan dari tempat yang sudah kosong dan malah menabrak
    subtitle di posisi barunya.
    """
    y = 0.5 if di_split else max(0.05, min(0.95, position_pct / 100.0))
    return (0.02, y - TINGGI_SUBTITLE / 2, 0.98, y + TINGGI_SUBTITLE / 2)


# Kandidat posisi ikon: (cx, cy). Urutan = preferensi awal (sudut atas dulu,
# karena wajah pembicara biasanya di tengah-atas dan subtitle di bawah).
KANDIDAT_IKON = [
    (0.82, 0.20), (0.18, 0.20),
    (0.82, 0.33), (0.18, 0.33),
    (0.84, 0.52), (0.16, 0.52),
    (0.82, 0.66), (0.18, 0.66),
    (0.50, 0.14),
]

# Kandidat b-roll: jendela lebar, jadi hanya sumbu Y yang digeser. Rapat
# (langkah ~0,04) supaya ada peluang menemukan celah bersih di antara kepala
# dan band subtitle — langkah kasar melewatkan celah yang sebenarnya ada.
KANDIDAT_BROLL_Y = [0.44, 0.40, 0.48, 0.36, 0.52, 0.32, 0.56, 0.28, 0.60,
                    0.24, 0.64, 0.20, 0.68, 0.16, 0.72]


def posisi_ikon(st: dict[str, Any], t: float, w_frac: float, h_frac: float,
                subtitle_pct: float,
                split_ranges: Optional[list[dict[str, Any]]] = None,
                dihindari: Optional[list[tuple[float, float, float, float]]] = None
                ) -> tuple[float, float, str]:
    """(cx, cy, alasan) posisi ikon yang tidak menutupi wajah/subtitle.

    w_frac/h_frac dipisah karena frame 9:16: ikon selebar 24% lebar hanya
    setinggi ~13,5% tinggi. Memakai satu angka untuk keduanya membuat kotak
    uji tumpang-tindih jauh lebih tinggi dari ikon sebenarnya, sehingga posisi
    yang sebenarnya bersih ikut ditolak.
    """
    di_split = any(float(s.get("start", 0)) <= t <= float(s.get("end", 0))
                   for s in (split_ranges or []))
    sub = band_subtitle(subtitle_pct, di_split)
    wajah = wajah_keluaran(st, t, split_ranges)
    kotak_wajah = [
        _kotak(cx, cy, w * WAJAH_LEBAR_X + PAD_WAJAH, w * WAJAH_TINGGI_Y + PAD_WAJAH)
        for cx, cy, w in wajah
    ]
    halangan = kotak_wajah + [sub] + list(dihindari or [])

    terbaik = None
    for cx, cy in KANDIDAT_IKON:
        k = _kotak(cx, cy, w_frac, h_frac)
        # keluar frame? tolak
        if k[0] < 0 or k[1] < 0 or k[2] > 1 or k[3] > 1:
            continue
        tabrak = sum(_tumpang(k, h) for h in halangan)
        # jarak ke wajah terdekat: makin jauh makin baik (untuk memilih antar
        # kandidat yang sama-sama bersih)
        jarak = min((abs(cx - fx) + abs(cy - fy) for fx, fy, _ in wajah),
                    default=1.0)
        skor = (tabrak, -jarak)
        if terbaik is None or skor < terbaik[0]:
            terbaik = (skor, cx, cy, tabrak)

    if terbaik is None:
        return 0.82, 0.20, "tidak ada kandidat muat → sudut kanan-atas"
    _, cx, cy, tabrak = terbaik
    alasan = ("bersih" if tabrak <= 1e-9
              else f"tumpang minimum {tabrak * 100:.2f}% (wajah close-up)")
    return cx, cy, alasan


def posisi_broll(st: dict[str, Any], t: float, w_frac: float, h_frac: float,
                 subtitle_pct: float,
                 split_ranges: Optional[list[dict[str, Any]]] = None,
                 dihindari: Optional[list[tuple[float, float, float, float]]] = None
                 ) -> tuple[float, float, str, float]:
    """(cx, cy, alasan, skala) untuk jendela b-roll.

    Dicoba berurutan: ukuran penuh di beberapa ketinggian, lalu MENGECIL kalau
    masih menabrak. Jendela b-roll setinggi ~23% frame; pada close-up (kepala
    memenuhi 25-45% tinggi) memang tidak ada ketinggian yang bersih pada ukuran
    penuh, jadi mengecilkan adalah satu-satunya cara menghormati permintaan
    "jangan menutupi wajah".
    """
    di_split = any(float(s.get("start", 0)) <= t <= float(s.get("end", 0))
                   for s in (split_ranges or []))
    sub = band_subtitle(subtitle_pct, di_split)
    wajah = wajah_keluaran(st, t, split_ranges)
    kotak_wajah = [
        _kotak(cx, cy, w * WAJAH_LEBAR_X + PAD_WAJAH, w * WAJAH_TINGGI_Y + PAD_WAJAH)
        for cx, cy, w in wajah
    ]
    halangan = kotak_wajah + list(dihindari or [])

    terbaik = None
    for skala in SKALA_BROLL:
        w = w_frac * skala
        h = h_frac * skala
        for cy in KANDIDAT_BROLL_Y:
            k = _kotak(0.5, cy, w, h)
            if k[1] < 0.02 or k[3] > 0.98:
                continue
            # subtitle diberi bobot: menutupi teks lebih buruk daripada
            # menyenggol wajah (lihat BOBOT_SUBTITLE)
            tabrak = (sum(_tumpang(k, hh) for hh in halangan)
                      + BOBOT_SUBTITLE * _tumpang(k, sub))
            if terbaik is None or tabrak < terbaik[0] - 1e-9:
                terbaik = (tabrak, cy, skala)
            if tabrak <= 1e-9:
                alasan = ("bersih" if skala == 1.0
                          else f"bersih setelah dikecilkan ke {skala:.0%}")
                return 0.5, cy, alasan, skala
    if terbaik is None:
        return 0.5, 0.44, "tidak ada kandidat muat → posisi bawaan", 1.0
    tabrak, cy, skala = terbaik
    luas = w_frac * h_frac * skala * skala
    alasan = f"tumpang minimum {tabrak / max(1e-9, luas) * 100:.0f}% luas b-roll"
    return 0.5, cy, alasan, skala


def jadwalkan(placements: list[dict[str, Any]],
              durasi: float) -> list[dict[str, Any]]:
    """Pisahkan waktu ikon dan b-roll supaya tidak muncul bersamaan.

    Ikon tetap di waktu aslinya (dipilih planner karena kata kuncinya di situ);
    b-roll digeser JEDA_IKON_BROLL detik setelahnya. Kalau pergeseran membuat
    b-roll melewati akhir klip, b-roll dibuang (biar tidak terpotong aneh).

    Durasi b-roll dipangkas agar selesai sebelum klip habis; kalau sisa ruang
    kurang dari MIN_BROLL_S, b-roll batal.
    """
    out: list[dict[str, Any]] = []
    for p in placements:
        q = dict(p)
        ts = float(q.get("time_start", 0) or 0)
        te = max(ts + 0.5, float(q.get("time_end", ts + 2.5) or ts + 2.5))
        if q.get("broll_url"):
            b0 = ts + JEDA_IKON_BROLL
            b1 = b0 + max(1.2, (te - ts))
            batas = durasi - 0.1
            if b1 > batas:
                b1 = batas                     # pangkas dulu, jangan langsung buang
            if b1 - b0 < MIN_BROLL_S:
                q["broll_url"] = None
                q["broll_skip_reason"] = "tidak cukup ruang di akhir klip"
            else:
                q["broll_start"] = round(b0, 2)
                q["broll_end"] = round(b1, 2)
        out.append(q)
    return out
