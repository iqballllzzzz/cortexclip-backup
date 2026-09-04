"""Membangun filter ffmpeg untuk AUTO LAYOUT (split/three/four/gameplay/fit).

CARA KERJANYA — dan kenapa begini.

Layout berubah PER SEGMEN di dalam satu klip, jadi tidak bisa dipilih lewat satu
rantai filter statis. Tiga pendekatan dipertimbangkan:

 1. render tiap segmen jadi berkas terpisah lalu concat — paling gampang, tapi
    menggandakan waktu encode dan menghasilkan jahitan GOP di tiap batas segmen.
 2. sendcmd untuk mengubah geometri crop — hanya bisa satu jendela crop; split
    butuh DUA potongan ditumpuk, tidak bisa dinyalakan/dimatikan lewat sendcmd.
 3. susun komposit layout SEKALI, lalu tempelkan di atas lapisan dasar `fill`
    dengan `overlay ... :enable='between(t,a,b)'`. Satu kali encode, batas segmen
    tepat pada frame, dan lapisan dasar tetap memakai crop dinamis face tracking.

Dipakai yang ke-3.

Panel pada komposit memakai posisi TETAP per segmen (rata-rata posisi orangnya di
segmen itu), bukan crop dinamis. Alasannya: dalam mode split layar orang sudah
dipotong ketat, dan menggerakkan panel membuat dua panel bergerak ke arah
berlawanan sekaligus — terlihat seperti gempa. Editor manusia juga memegang
panel split tetap diam.
"""
from __future__ import annotations

from typing import Any, Optional

from .auto_layout import FILL, FIT, FOUR, GAMEPLAY, SCREENSHARE, SPLIT, THREE

# berapa panel untuk tiap layout
N_PANEL = {SPLIT: 2, THREE: 3, FOUR: 4}


def _panel_crop(label_in: str, label_out: str, src_w: int, src_h: int,
                out_w: int, panel_h: int, cx_frac: float,
                cy_frac: float = 0.45, cw_frac: float = 0.58) -> str:
    """Satu panel: crop dari sumber pada rasio panel lalu skala ke ukuran panel.

    cx_frac/cy_frac = titik pusat yang ingin dipertahankan (0..1 dari sumber).
    cw_frac = lebar crop sebagai fraksi lebar sumber. INI YANG MENENTUKAN
    KETATNYA framing, dan harus lebih kecil kalau panelnya banyak.

    KENAPA cw_frac ADA. Versi pertama menghitung crop dari rasio panel saja:
    lebar = tinggi_sumber x rasio_panel. Untuk layout `three` rasio panelnya
    720/426 = 1.69, hampir sama dengan rasio sumber 16:9 = 1.78 — jadi crop-nya
    memakan 1216 dari 1280 piksel, dan KETIGA panel menampilkan gambar yang
    praktis identik. Terukur pada uji ffmpeg: tiga panel keluar dengan warna
    rata-rata sama persis (126,95,63). Layout-nya jalan tapi tak ada gunanya.

    Sekarang lebar crop ditentukan lebih dulu dari jumlah panel, lalu tingginya
    diturunkan dari rasio panel. Hasilnya potongan ketat per orang, seperti
    panel split OpusClip.
    """
    ratio = out_w / max(1, panel_h)
    cw = int(src_w * max(0.12, min(1.0, cw_frac)))
    ch = int(cw / ratio)
    if ch > src_h:                              # panel lebih tinggi dari sumber
        ch = src_h
        cw = int(ch * ratio)
    cw = max(16, min(src_w, cw // 2 * 2))
    ch = max(16, min(src_h, ch // 2 * 2))
    x = int(cx_frac * src_w - cw / 2)
    y = int(cy_frac * src_h - ch / 2)
    x = max(0, min(src_w - cw, x))
    y = max(0, min(src_h - ch, y))
    return (f"[{label_in}]crop=w={cw}:h={ch}:x={x}:y={y},"
            f"scale={out_w}:{panel_h}:flags=bicubic[{label_out}]")


def _cw_frac_untuk(n_panel: int) -> float:
    """Lebar crop per panel: makin banyak panel, makin ketat potongannya.

    n=2 → 0.58 (dua orang berdampingan, tiap panel setengah frame lebih sedikit)
    n=3 → 0.41
    n=4 → 0.33
    """
    return max(0.28, min(0.62, 1.0 / max(1, n_panel) + 0.08))


def build_layout_filter(segmen: list[dict[str, Any]], src_w: int, src_h: int,
                        out_w: int, out_h: int, base_label: str = "base",
                        in_label: str = "0:v") -> tuple[list[str], str]:
    """Rangkai filter_complex untuk semua segmen non-FILL.

    Mengembalikan (daftar_bagian_filter, label_keluaran_terakhir).
    `base_label` = lapisan dasar (hasil crop dinamis face tracking, sudah
    diskalakan ke out_w x out_h). Segmen FILL tidak menghasilkan apa pun karena
    lapisan dasar itu SUDAH layout fill.

    Setiap segmen non-FILL butuh satu salinan input, jadi input dipecah lewat
    `split` sebanyak yang diperlukan.
    """
    kerja = [s for s in segmen if s.get("layout") != FILL]
    if not kerja:
        return [], base_label

    parts: list[str] = []
    # berapa salinan input yang dibutuhkan seluruh segmen
    total_salinan = 0
    for s in kerja:
        lay = s["layout"]
        total_salinan += N_PANEL.get(lay, 2 if lay in (GAMEPLAY, SCREENSHARE) else 1)
    labels = [f"src{i}" for i in range(total_salinan)]
    parts.append(f"[{in_label}]split={total_salinan}"
                 + "".join(f"[{l}]" for l in labels))

    idx = 0
    cur = base_label
    for si, s in enumerate(kerja):
        lay = s["layout"]
        a, b = float(s["start"]), float(s["end"])
        pos: list[float] = list(s.get("positions") or [])
        comp = f"comp{si}"

        if lay == FOUR:
            # GRID 2x2, BUKAN empat baris bertumpuk.
            # Empat panel yang di-vstack pada bingkai 9:16 menghasilkan pita
            # 720x320 per orang — rasio 2,25:1, jadi wajah terpotong atas-bawah
            # dan hampir tidak ada yang terlihat. Grid 2x2 memberi 360x640 per
            # panel, yaitu 9:16 penuh per orang. Ini juga yang dipakai OpusClip.
            pw = out_w // 2 // 2 * 2
            ph = out_h // 2 // 2 * 2
            while len(pos) < 4:
                pos.append((len(pos) + 0.5) / 4)
            pos = pos[:4]
            # urutan panel: kiri-atas, kanan-atas, kiri-bawah, kanan-bawah
            pl = []
            for k in range(4):
                lbl = f"q{si}_{k}"
                parts.append(_panel_crop(labels[idx], lbl, src_w, src_h,
                                         pw, ph, pos[k], cw_frac=0.30))
                pl.append(lbl)
                idx += 1
            parts.append(f"[{pl[0]}][{pl[1]}]hstack=inputs=2[{si}top]")
            parts.append(f"[{pl[2]}][{pl[3]}]hstack=inputs=2[{si}bot]")
            sisa_w = out_w - pw * 2
            sisa_h = out_h - ph * 2
            atas, bawah = f"{si}top", f"{si}bot"
            if sisa_w or sisa_h:
                # tambal pembagian bulat supaya ukuran akhir tepat out_w x out_h
                parts.append(f"[{atas}]pad={out_w}:{ph}:0:0[{si}topp]")
                parts.append(f"[{bawah}]pad={out_w}:{out_h - ph}:0:0[{si}botp]")
                atas, bawah = f"{si}topp", f"{si}botp"
            parts.append(f"[{atas}][{bawah}]vstack=inputs=2[{comp}]")

        elif lay in N_PANEL:
            n = N_PANEL[lay]
            panel_h = out_h // n
            # posisi kurang → sebar merata; kebanyakan → ambil n pertama
            while len(pos) < n:
                pos.append((len(pos) + 0.5) / n)
            pos = pos[:n]
            plabels = []
            cwf = _cw_frac_untuk(n)
            for k in range(n):
                pl = f"p{si}_{k}"
                parts.append(_panel_crop(labels[idx], pl, src_w, src_h,
                                         out_w, panel_h, pos[k], cw_frac=cwf))
                plabels.append(pl)
                idx += 1
            # sisa piksel karena pembagian bulat ditambal di panel terakhir
            sisa = out_h - panel_h * n
            if sisa:
                pad = f"pad{si}"
                parts.append(f"[{plabels[-1]}]pad={out_w}:{panel_h + sisa}:0:0[{pad}]")
                plabels[-1] = pad
            parts.append("".join(f"[{l}]" for l in plabels)
                         + f"vstack=inputs={n}[{comp}]")

        elif lay == GAMEPLAY:
            # docs OpusClip: 30% orang di ATAS, 70% gameplay di BAWAH
            h_atas = int(out_h * 0.30) // 2 * 2
            h_bawah = out_h - h_atas
            cx = pos[0] if pos else 0.5
            parts.append(_panel_crop(labels[idx], f"g{si}a", src_w, src_h,
                                     out_w, h_atas, cx, cw_frac=0.42))
            idx += 1
            # bagian bawah: seluruh frame sumber (aksinya), muat penuh selebar
            parts.append(f"[{labels[idx]}]scale={out_w}:{h_bawah}:"
                         f"force_original_aspect_ratio=decrease,"
                         f"pad={out_w}:{h_bawah}:(ow-iw)/2:(oh-ih)/2:black[g{si}b]")
            idx += 1
            parts.append(f"[g{si}a][g{si}b]vstack=inputs=2[{comp}]")

        elif lay == SCREENSHARE:
            # layar di ATAS setengah, orang di BAWAH setengah
            h = out_h // 2
            parts.append(f"[{labels[idx]}]scale={out_w}:{h}:"
                         f"force_original_aspect_ratio=decrease,"
                         f"pad={out_w}:{h}:(ow-iw)/2:(oh-ih)/2:black[s{si}a]")
            idx += 1
            cx = pos[0] if pos else 0.5
            parts.append(_panel_crop(labels[idx], f"s{si}b", src_w, src_h,
                                     out_w, out_h - h, cx, cw_frac=0.46))
            idx += 1
            parts.append(f"[s{si}a][s{si}b]vstack=inputs=2[{comp}]")

        elif lay == FIT:
            # sumber 4:3 di tengah + bilah hitam atas-bawah
            parts.append(f"[{labels[idx]}]scale={out_w}:-2:flags=bicubic,"
                         f"pad={out_w}:{out_h}:0:(oh-ih)/2:black[{comp}]")
            idx += 1

        else:                                   # layout tak dikenal → lewati
            continue

        keluar = f"mix{si}"
        parts.append(f"[{cur}][{comp}]overlay=0:0:"
                     f"enable='between(t\\,{a:.3f}\\,{b:.3f})'[{keluar}]")
        cur = keluar

    return parts, cur


def posisi_panel(frames: list[dict[str, Any]], fps: float,
                 seg: dict[str, Any], n: int) -> list[float]:
    """Rata-rata cx (0..1) n orang terdepan pada satu segmen, urut kiri→kanan.

    Dipakai untuk mengisi `positions` sebelum memanggil build_layout_filter.
    """
    a = int(float(seg["start"]) * fps)
    b = min(len(frames) - 1, int(float(seg["end"]) * fps) - 1)
    kum: list[list[float]] = []
    for fr in frames[a:b + 1]:
        wajah = sorted(fr.get("faces", []), key=lambda f: -f.get("w_frac", 0))[:n]
        if len(wajah) < n:
            continue
        for k, f in enumerate(sorted(wajah, key=lambda f: f.get("cx", 0.5))):
            while len(kum) <= k:
                kum.append([])
            kum[k].append(float(f.get("cx", 0.5)))
    out: list[float] = []
    for k in range(n):
        if k < len(kum) and kum[k]:
            s = sorted(kum[k])
            out.append(s[len(s) // 2])          # median: kebal frame melenceng
        else:
            out.append((k + 0.5) / n)
    return out
