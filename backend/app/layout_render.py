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
    """Satu panel: crop dari FRAMED (base) pada posisi orang, lalu skala.

    label_in adalah salinan lapisan dasar yang SUDAH direframe 9:16 dan
    di-track (vbase) — BUKAN sumber mentah 16:9. cx_frac = posisi orang pada
    frame itu. Rasio panel > 9:16 (three 720/426=1,69) menuntut jendela lebih
    sempit dari lebar penuh; cw_frac mengaturnya per jumlah panel
    (_cw_frac_untuk). Tinggi jendela mengikuti tinggi frame (cy_frac=0 default
    pada pemanggil baru), sehingga wajah tidak terpotong vertikal.
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


def _panel_sumber(label_in: str, label_out: str, src_w: int, src_h: int,
                  out_w: int, panel_h: int, cx_frac: float) -> str:
    """Panel dari SUMBER (16:9): jendela KETAT dipusatkan di orang.

    KENAPA DARI SUMBER, BUKAN DARI BASE. Terukur (uji base-dua-wajah.py): base
    9:16 hasil tracking hanya memuat SATU wajah — 0/14 sampel dua-wajah — karena
    jendela crop 9:16 terlalu sempit untuk dua orang berdampingan. Panel split
    yang dipotong dari base mustahil menampilkan dua orang. Sumber 16:9 memuat
    keduanya (110/110 frame dua-wajah pada segmen yang sama).

    Bukti desain ini (uji panel-dari-sumber.py): panel atas wajah 14/14
    cx~0.34 (orang kiri), panel bawah wajah 14/14 cx~0.67 (orang kanan).

    LEBAR JENDELA. Rasio panel three (720/426=1.69) x tinggi sumber 720 =
    1216px — hampir seluruh sumber 1280px, jadi ketiga panel saling menelan
    (terukur: tiga panel hijau identik). Jendela dibatasi maksimal 42% lebar
    sumber supaya tiap panel fokus ke orangnya; sisa rasio ditutup oleh scale
    (sedikit distorsi aspek pada panel three/four — pilihan sadar: fokus orang
    lebih penting daripada kebenaran aspek di panel kecil).
    """
    ratio = out_w / max(1, panel_h)
    cw = min(src_w, int(src_h * ratio) // 2 * 2)
    cw = min(cw, int(src_w * 0.42) // 2 * 2)
    cw = max(16, cw)
    ch = src_h
    x = int(cx_frac * src_w - cw / 2)
    x = max(0, min(src_w - cw, x))
    return (f"[{label_in}]crop=w={cw}:h={ch}:x={x}:y=0,"
            f"scale={out_w}:{panel_h}:flags=bicubic[{label_out}]")


def _panel_dari_base(label_in: str, label_out: str, base_w: int, base_h: int,
                     out_w: int, panel_h: int, cx_frac: float) -> str:
    """Panel dari lapisan BASE 9:16 (sudah di-track): jendela horizontal.

    Base sudah 9:16 penuh (mis. 720x1280). Panel perlu jendela selebar
    cw = base_h * rasio_panel, setinggi base penuh, dipusatkan di cx_frac.
    cx_frac dihitung pada RUANG BASE oleh posisi_panel_base() — pusat kamera
    selalu 0.5, orang lain digeser relatif terhadapnya.
    """
    ratio = out_w / max(1, panel_h)
    cw = min(base_w, int(base_h * ratio) // 2 * 2)
    ch = base_h
    x = int(cx_frac * base_w - cw / 2)
    x = max(0, min(base_w - cw, x))
    return (f"[{label_in}]crop=w={cw}:h={ch}:x={x}:y=0,"
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
                        in_label: str = "0:v",
                        panel_dari_base: bool = True) -> tuple[list[str], str]:
    """Rangkai filter_complex untuk semua segmen non-FILL.

    Mengembalikan (daftar_bagian_filter, label_keluaran_terakhir).
    `base_label` = lapisan dasar (hasil crop dinamis face tracking, sudah
    diskalakan ke out_w x out_h). Segmen FILL tidak menghasilkan apa pun karena
    lapisan dasar itu SUDAH layout fill.

    PANEL WAJIB MENGAMBIL DARI BASE, BUKAN DARI INPUT MENTAH (panel_dari_base).
    Dulu split dilakukan pada [0:v] — frame mentah 16:9 TANPA face tracking —
    sementara lapisan dasar [vbase] memakai hasil sendcmd+crop. Akibat terukur
    (uji nyata, klip garasi dua orang):
      - posisi orang di panel melenceng (cx 0,65 padahal rencana 0,22);
      - face tracking DIHAPUS di dalam segmen layout tapi aktif di luar —
        persis keluhan "pas auto layout aktif, tracking jadi gak pas dan
        videonya berubah".
    Kini salinan panel diambil dari base yang SUDAH direframe 9:16 dan
    di-track; panel tinggal memotong secara horizontal (x penuh) pada posisi
    orang. `panel_dari_base=False` dipertahankan hanya untuk uji sintetis yang
    memang memberi sumber tanpa tracking.
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
    sumber = base_label if panel_dari_base else in_label
    salinan_dasar = "dasar" if panel_dari_base else None
    if salinan_dasar:
        # panel dari base: split dari base; salinan ekstra jadi dasar overlay
        # (ffmpeg 6.1 menolak label base yang direferensikan dua kali)
        parts.append(f"[{sumber}]split={total_salinan + 1}[{salinan_dasar}]"
                     + "".join(f"[{l}]" for l in labels))
    else:
        # panel dari sumber: dasar overlay = base (hanya direferensikan sekali)
        parts.append(f"[{sumber}]split={total_salinan}"
                     + "".join(f"[{l}]" for l in labels))

    idx = 0
    cur = base_label
    # Base = lapisan yang SUDAH direframe 9:16 & di-track. Bila panel memotong
    # base, ukurannya selalu out_w x out_h.
    base_w, base_h = out_w, out_h
    for si, s in enumerate(kerja):
        lay = s["layout"]
        a, b = float(s["start"]), float(s["end"])
        pos: list[float] = list(s.get("positions") or [])
        comp = f"comp{si}"

        if lay == FOUR:
            # GRID 2x2 dari SUMBER (16:9 memuat 4 orang; base 9:16 tak mungkin).
            # Tiap kuadran: jendela rasio 9:16 (360x640 dari sumber 720 tinggi)
            # dipusatkan di orang, lalu skala ke 360x640.
            pw = out_w // 2 // 2 * 2
            ph = out_h // 2 // 2 * 2
            while len(pos) < 4:
                pos.append((len(pos) + 0.5) / 4)
            pos = pos[:4]
            # urutan panel: kiri-atas, kanan-atas, kiri-bawah, kanan-bawah
            pl = []
            kuadran_h = int(src_h * (ph / out_h))
            for k in range(4):
                lbl = f"q{si}_{k}"
                cxk = pos[k]
                qw = min(src_w, max(16, int(kuadran_h * (pw / ph)) // 2 * 2))
                x0 = int(cxk * src_w - qw / 2)
                x0 = max(0, min(src_w - qw, x0))
                parts.append(f"[{labels[idx]}]crop=w={qw}:h={kuadran_h}:x={x0}:y=0,"
                             f"scale={pw}:{ph}:flags=bicubic[{lbl}]")
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
            # Panel berjajar ATAS-BAWAH. PANEL DARI SUMBER, bukan dari base:
            # base 9:16 hasil tracking hanya memuat SATU wajah (terukur 0/14),
            # jendela crop terlalu sempit untuk dua orang. Sumber 16:9 memuat
            # keduanya; posisi jendela = posisi orang sumber (posisi_panel).
            # Wajah tetap di tengah panelnya karena panel_ratio memakai tinggi
            # penuh sumber dan y=0.
            n = N_PANEL[lay]
            panel_h = out_h // n
            while len(pos) < n:
                pos.append((len(pos) + 0.5) / n)
            pos = pos[:n]
            plabels = []
            for k in range(n):
                pl = f"p{si}_{k}"
                parts.append(_panel_sumber(labels[idx], pl, src_w, src_h,
                                           out_w, panel_h, pos[k]))
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
            # docs OpusClip: 30% orang di ATAS, 70% gameplay di BAWAH.
            # Panel orang dari SUMBER (rasisio panel sempit); gameplay = sumber
            # penuh mengecil. Keduanya dari salinan sumber agar satu ruang
            # koordinat (posisi_panel = ruang sumber).
            h_atas = int(out_h * 0.30) // 2 * 2
            h_bawah = out_h - h_atas
            cx = pos[0] if pos else 0.5
            parts.append(_panel_sumber(labels[idx], f"g{si}a", src_w, src_h,
                                       out_w, h_atas, cx))
            idx += 1
            parts.append(f"[{labels[idx]}]scale={out_w}:{h_bawah}:"
                         f"force_original_aspect_ratio=decrease,"
                         f"pad={out_w}:{h_bawah}:(ow-iw)/2:(oh-ih)/2:black[g{si}b]")
            idx += 1
            parts.append(f"[g{si}a][g{si}b]vstack=inputs=2[{comp}]")

        elif lay == SCREENSHARE:
            # layar di ATAS setengah, orang di BAWAH setengah — keduanya dari
            # sumber dengan posisi ruang sumber (satu ruang koordinat)
            h = out_h // 2
            parts.append(f"[{labels[idx]}]scale={out_w}:{h}:"
                         f"force_original_aspect_ratio=decrease,"
                         f"pad={out_w}:{h}:(ow-iw)/2:(oh-ih)/2:black[s{si}a]")
            idx += 1
            cx = pos[0] if pos else 0.5
            parts.append(_panel_sumber(labels[idx], f"s{si}b", src_w, src_h,
                                       out_w, out_h - h, cx))
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
        # dasar overlay: panel-dari-base → salinan "dasar" untuk segmen pertama
        # (label base tak boleh direferensikan dua kali di ffmpeg 6.1);
        # panel-dari-sumber → base bebas dipakai langsung (tidak ada salinan
        # ekstra yang bisa menggantung).
        if panel_dari_base:
            dasar = salinan_dasar if si == 0 else cur
        else:
            dasar = cur
        parts.append(f"[{dasar}][{comp}]overlay=0:0:"
                     f"enable='between(t\\,{a:.3f}\\,{b:.3f})'[{keluar}]")
        cur = keluar

    return parts, cur


def posisi_panel_base(frames: list[dict[str, Any]], fps: float,
                      seg: dict[str, Any], n: int,
                      traj: Optional[list[float]] = None,
                      src_w: int = 0, crop_w: int = 0) -> list[float]:
    """Posisi panel pada RUANG BASE (frame 9:16 hasil face tracking).

    KENAPA BUKAN posisi_panel(). Posisi wajah di `layout_frames` dihitung pada
    SUMBER 16:9, sedangkan panel memotong lapisan BASE — frame yang sudah
    digeser kamera mengikuti pembicara. Memakai cx sumber langsung untuk
    memotong base = dua ruang koordinat dicampur (terukur: orang kiri 0.22
    pada sumber berada di 0.32 pada base, orang kanan 0.79 → 0.50).

    Pemetaan: orang di cx_sumber tampak di base pada
        0.5 + (cx_sumber - cx_kamera) * (crop_w / src_w)
    dengan cx_kamera = trajektori pada frame itu (pusat base selalu kamera).
    Kalau trajektori tidak tersedia, jatuh ke perilaku lama (cx sumber).
    """
    a = int(float(seg["start"]) * fps)
    b = min(len(frames) - 1, int(float(seg["end"]) * fps) - 1)

    if not traj or not src_w or not crop_w:
        return posisi_panel(frames, fps, seg, n)

    scale = crop_w / max(1, src_w)
    kum: list[list[float]] = []
    for i in range(a, b + 1):
        wajah = sorted(frames[i].get("faces", []),
                       key=lambda f: -f.get("w_frac", 0))[:n]
        if len(wajah) < n:
            continue
        cam_px = traj[min(len(traj) - 1, i)] / max(1, src_w)
        urut = sorted(wajah, key=lambda f: f.get("cx", 0.5))
        for k, f in enumerate(urut):
            cx_base = 0.5 + (float(f.get("cx", 0.5)) - cam_px) * scale
            while len(kum) <= k:
                kum.append([])
            kum[k].append(cx_base)
    out: list[float] = []
    for k in range(n):
        if k < len(kum) and kum[k]:
            s = sorted(kum[k])
            med = s[len(s) // 2]
            # jepit ke rentang valid jendela panel
            out.append(max(0.0, min(1.0, med)))
        else:
            out.append((k + 0.5) / n)
    return out


def posisi_panel(frames: list[dict[str, Any]], fps: float,
                 seg: dict[str, Any], n: int) -> list[float]:
    """Rata-rata cx (0..1) n orang terdepan pada satu segmen, urut kiri→kanan.

    Dipakai untuk mengisi `positions` sebelum memanggil build_layout_filter.
    Posisi dihitung pada RUANG SUMBER; untuk memotong lapisan base yang sudah
    di-track, pakai posisi_panel_base() yang memetakan ke ruang base.
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
