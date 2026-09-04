"""Perencana AUTO LAYOUT — meniru perilaku OpusClip "applicable auto layout".

Docs OpusClip (help.opus.pro/docs/article/layout-and-reframing) menyebut tujuh
tata letak. Yang penting dari dokumen itu: layout dipilih PER SEGMEN dan hanya
"when applicable" — Split hanya jalan kalau kedua pembicara memang tampak
bersama di frame sumber, Three/Four butuh >=3 wajah bersama, Screenshare butuh
konten layar + satu orang, Gameplay menaruh orang 30% di atas dan gameplay 70%
di bawah.

Modul ini TIDAK merender apa pun. Tugasnya satu: dari hasil analisis wajah
(jejak per frame) + isyarat visual, menghasilkan daftar segmen berisi layout
yang layak dipakai. Render dan UI memakai keluaran ini.

KENAPA DIPISAH DARI face_pipeline: keputusan layout perlu MELIHAT SELURUH klip
(berapa lama dua orang bersama, kapan mereka bicara bersamaan), sementara
face_pipeline bekerja mengalir per frame. Memaksa keduanya menyatu berarti
menahan seluruh frame di memori — masalah yang sudah pernah menjatuhkan backend
(RSS 2,4 GB).
"""
from __future__ import annotations

from typing import Any, Optional

# Layout yang dikenali. Nilainya dipakai apa adanya di API dan UI.
FILL = "fill"
FIT = "fit"
SPLIT = "split"
THREE = "three"
FOUR = "four"
SCREENSHARE = "screenshare"
GAMEPLAY = "gameplay"

SEMUA_LAYOUT = (FILL, FIT, SPLIT, THREE, FOUR, SCREENSHARE, GAMEPLAY)

# --- ambang keputusan (semua diukur, bukan ditebak; lihat komentar per angka)
MIN_SEG_S = 2.0           # segmen lebih pendek dari ini digabung ke tetangganya
                          # (potongan layout < 2s terasa seperti kedipan)
TOGETHER_FRAC = 0.75      # >=75% frame segmen harus memuat semua wajah yang
                          # dipakai layout itu — kalau tidak, layout "tidak
                          # applicable" dan jatuh ke FILL
BOTH_TALK_FRAC = 0.22     # >=22% frame ada >=2 orang aktif (bicara/tertawa)
                          # barulah SPLIT dianggap menambah nilai
MIN_FACE_FRAC = 0.035     # wajah < 3.5% lebar frame = terlalu kecil untuk panel
# Ambang "orang ini sedang aktif" KHUSUS auto layout. Sengaja lebih rendah dari
# SPEAK_ON (0.0060) yang dipakai memilih kamera: split pantas muncul saat orang
# kedua tertawa atau menyahut "oh" — mulutnya bergerak, tapi belum tentu lewat
# ambang bicara penuh. Terukur pada podcast nyata: dengan SPEAK_ON, 0% dari 452
# frame punya >=2 orang aktif; dengan 0.0025, split muncul di bagian yang memang
# dua orang saling menyahut.
ACTIVE_SPEAK = 0.0025
# CATATAN: pernah ada aturan tambahan SWITCH_HOLD_S ("layout tidak boleh berganti
# lebih cepat dari 2.5 detik") yang menggabungkan segmen ke tetangga sebelumnya
# kalau tetangga itu lebih pendek dari ambang. Itu DIBUANG karena efeknya
# terbalik: pada klip yang dibuka 2 detik satu orang lalu 6 detik dua orang,
# segmen FILL pembuka (2s < 2.5s) MENELAN seluruh segmen SPLIT — jadi split tidak
# pernah muncul sama sekali (terukur: SPLIT 0.0s dari 10s). MIN_SEG_S sudah
# mencegah kedipan, dan _rentang_layak() sudah menolak kemunculan singkat.


def _rentang_layak(frames: list[dict[str, Any]], n_wajah: int,
                   fps: float) -> list[tuple[int, int]]:
    """Rentang frame di mana MINIMAL n_wajah tampak bersama dan cukup besar."""
    ok = [
        sum(1 for f in fr.get("faces", []) if f.get("w_frac", 0) >= MIN_FACE_FRAC)
        >= n_wajah
        for fr in frames
    ]
    out: list[tuple[int, int]] = []
    i = 0
    while i < len(ok):
        if not ok[i]:
            i += 1
            continue
        j = i
        while j + 1 < len(ok) and ok[j + 1]:
            j += 1
        if (j - i + 1) >= fps * MIN_SEG_S:
            out.append((i, j))
        i = j + 1
    return out


def _aktif(f: dict[str, Any]) -> bool:
    """Apakah wajah ini 'aktif' menurut ambang auto layout.

    Menerima dua bentuk: `speak` (skor mentah, dipakai pipeline) atau `active`
    (boolean, dipakai uji). Skor mentah didahulukan.
    """
    if "speak" in f:
        return float(f.get("speak") or 0.0) >= ACTIVE_SPEAK
    return bool(f.get("active"))


def _fraksi_bicara_bersama(frames: list[dict[str, Any]], a: int, b: int) -> float:
    """Fraksi frame di rentang [a,b] yang punya >=2 orang aktif sekaligus."""
    if b < a:
        return 0.0
    n = 0
    for fr in frames[a:b + 1]:
        if sum(1 for f in fr.get("faces", []) if _aktif(f)) >= 2:
            n += 1
    return n / float(b - a + 1)


def rencana_layout(frames: list[dict[str, Any]], fps: float,
                   diizinkan: Optional[list[str]] = None,
                   punya_screenshare: bool = False,
                   punya_gameplay: bool = False) -> list[dict[str, Any]]:
    """Hasilkan daftar segmen {start, end, layout} untuk satu klip.

    frames: satu entri per frame analisis:
        {"faces": [{"cx","cy","w_frac","active"}, ...]}
    diizinkan: layout yang dicentang pengguna. None / semua = mode CERDAS
        (sistem memilih sendiri sesuai isi video).
    punya_screenshare / punya_gameplay: isyarat dari pemeriksa konten layar.

    Aturan urutan prioritas mengikuti dokumen OpusClip: layout khusus (gameplay,
    screenshare) menang kalau kontennya ada; lalu jumlah wajah bersama
    (four > three > split); sisanya FILL. FIT hanya dipakai kalau pengguna
    memintanya secara eksplisit — memasang bilah hitam otomatis akan mengejutkan.
    """
    if not frames:
        return []
    izin = set(diizinkan or SEMUA_LAYOUT)
    total = len(frames)
    dur = total / max(1.0, fps)
    seg: list[dict[str, Any]] = []

    def tambah(a: int, b: int, layout: str) -> None:
        if b < a:
            return
        seg.append({"start": a / fps, "end": (b + 1) / fps, "layout": layout})

    # 1) Gameplay & screenshare berlaku untuk SELURUH klip: keduanya sifat
    #    sumber, bukan momen. Kalau kontennya ada dan diizinkan, selesai.
    if punya_gameplay and GAMEPLAY in izin:
        tambah(0, total - 1, GAMEPLAY)
        return seg
    if punya_screenshare and SCREENSHARE in izin:
        tambah(0, total - 1, SCREENSHARE)
        return seg

    # 2) Cari rentang multi-wajah, dari yang paling banyak.
    kandidat: list[tuple[int, int, str]] = []
    for n, nama in ((4, FOUR), (3, THREE), (2, SPLIT)):
        if nama not in izin:
            continue
        for a, b in _rentang_layak(frames, n, fps):
            if nama == SPLIT and _fraksi_bicara_bersama(frames, a, b) < BOTH_TALK_FRAC:
                # dua orang terlihat, tapi hanya satu yang aktif → FILL lebih
                # baik: split membuang setengah layar untuk orang yang diam.
                continue
            kandidat.append((a, b, nama))
    # rentang yang lebih "kaya" (lebih banyak orang) menang saat bertumpuk
    urutan = {FOUR: 3, THREE: 2, SPLIT: 1}
    kandidat.sort(key=lambda k: (-urutan[k[2]], k[0]))

    dipakai = [False] * total
    terpilih: list[tuple[int, int, str]] = []
    for a, b, nama in kandidat:
        if any(dipakai[a:b + 1]):
            continue
        for i in range(a, b + 1):
            dipakai[i] = True
        terpilih.append((a, b, nama))
    terpilih.sort(key=lambda k: k[0])

    # 3) Sisipkan FILL di celah, lalu gabungkan segmen kependekan.
    hasil: list[tuple[int, int, str]] = []
    kursor = 0
    for a, b, nama in terpilih:
        if a > kursor:
            hasil.append((kursor, a - 1, FILL))
        hasil.append((a, b, nama))
        kursor = b + 1
    if kursor < total:
        hasil.append((kursor, total - 1, FILL))

    # gabung segmen < MIN_SEG_S ke tetangga sebelumnya
    rapi: list[list[Any]] = []
    for a, b, nama in hasil:
        if rapi and (b - a + 1) < fps * MIN_SEG_S:
            rapi[-1][1] = b
            continue
        rapi.append([a, b, nama])

    for a, b, nama in rapi:
        tambah(a, b, nama)
    if not seg:
        tambah(0, total - 1, FILL)
    return seg


def ringkas(seg: list[dict[str, Any]]) -> dict[str, float]:
    """Total durasi per layout — dipakai UI dan uji."""
    out: dict[str, float] = {}
    for s in seg:
        out[s["layout"]] = out.get(s["layout"], 0.0) + (s["end"] - s["start"])
    return out
