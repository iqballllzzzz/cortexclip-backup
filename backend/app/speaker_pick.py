"""Bagian 3 speaker_track: pilih siapa yang disorot + bangun trajektori kamera.

Aturan pemilihan (inilah yang mencegah kamera menyorot ruang kosong):

- kamera SELALU berada tepat pada satu wajah, tidak pernah pada rata-rata
  beberapa wajah;
- pergantian orang aktif SELALU dicatat sebagai potongan, dan penghalusan
  dilakukan per segmen antar potongan — jadi kurva halus tidak pernah melintas
  dari wajah A ke wajah B melalui titik di antara keduanya;
- kalau tidak ada yang bicara, kamera BERTAHAN pada orang terakhir.
"""
from __future__ import annotations

import math
from typing import Any, Optional

from .speaker_track import (AV_TIE_MARGIN, AV_TIE_RATIO, COOLDOWN_S,
                            CUT_MIN_SAMPLES, DEADZONE_FRAC, DOMINANCE,
                            HOLD_FRAMES, LOOKAHEAD_S, LOST_HOLD_S,
                            MAX_PAN_PER_S, RECENT_FRAMES, SMOOTH_TIME_S,
                            SPEAK_OFF, SPEAK_ON, SPRING_HZ, STICKY_S,
                            STILL_SPAN_FRAC)


def pick_active(live: list[dict[str, Any]], state: dict[str, Any], fi: int,
                fps: float, all_tracks: Optional[list[dict[str, Any]]] = None,
                ) -> tuple[Optional[dict[str, Any]], bool]:
    """Pilih wajah yang disorot. Balik (track, apakah_ini_potongan)."""
    if not live:
        return None, False

    cur = None
    # Wajah yang BENAR-BENAR terdeteksi pada frame ini. `live` juga memuat track
    # yang terlihat sampai RECENT_FRAMES lalu — itu perlu supaya deteksi yang
    # bolong 1-2 frame tidak memindahkan kamera, TAPI kalau dipakai apa adanya
    # track basi tetap terhitung "hidup" sehingga aturan pindah di bawah tidak
    # pernah aktif. Terukur pada podcast nyata: kamera menatap x=801 selama 3
    # detik sementara satu-satunya wajah yang terlihat ada di x=1307 (error 83%
    # lebar crop) — itu persis "kamera di tengah / di ruang kosong".
    now = [t for t in live if t["last"] == fi
           and fi - t.get("seen_full", -10 ** 6) <= RECENT_FRAMES]
    if state["uid"] is not None:
        cur = next((t for t in live if t["uid"] == state["uid"]), None)
        stale = cur if cur is not None else next(
            (t for t in (all_tracks or []) if t["uid"] == state["uid"]), None)
        terlihat_skrg = cur is not None and cur["last"] == fi
        if stale is not None and not terlihat_skrg:
            diam = fi - stale["last"]
            if diam <= fps * LOST_HOLD_S:
                return stale, False          # bolong sebentar → bertahan
            # Sudah lama hilang. Pindah HANYA kalau tidak ada keraguan: tepat
            # SATU wajah yang terlihat sekarang. Kalau lebih dari satu, memaksa
            # pindah berbahaya — pilihannya jatuh ke wajah terbesar/skor
            # tertinggi yang belum tentu pembicara, lalu kamera terkunci di sana
            # (uji 3 orang jatuh 100% → 33% saat itu dicoba).
            if len(now) == 1:
                pick = now[0]
                state["uid"] = pick["uid"]
                state["hold"] = 0
                state["last_cut"] = fi
                return pick, True
            return stale, False
        if cur is None:
            cur = stale

    # belum ada / orangnya benar-benar hilang → ambil yang paling bicara; kalau
    # tidak ada yang bicara ambil wajah terbesar (paling depan)
    if cur is None:
        speaking = [t for t in live if t["speak"] >= SPEAK_ON]
        pick = (max(speaking, key=lambda t: t["speak"]) if speaking
                else max(live, key=lambda t: t["area"]))
        is_cut = state["uid"] is not None and pick["uid"] != state["uid"]
        state["uid"] = pick["uid"]
        state["hold"] = 0
        if is_cut:
            state["last_cut"] = fi
        return pick, is_cut

    if len(live) == 1:
        return cur, False

    others = [t for t in live if t["uid"] != cur["uid"]]
    cand = max(others, key=lambda t: t["speak"]) if others else None
    if cand is None:
        return cur, False

    # Rem histeresis: setelah baru berpindah, kandidat lain ditahan sebentar.
    # Tanpa ini kamera bisa bolak-balik tiap ~1 detik saat dua orang skornya
    # berdekatan (terlihat pada uji: B->C->B->C dalam 3 detik).
    if fi - state["last_cut"] < fps * STICKY_S:
        return cur, False

    layak = (
        cand["speak"] >= SPEAK_ON                      # benar-benar bicara
        and cand["speak"] > cur["speak"] * DOMINANCE   # jelas lebih dominan
        # dan datanya cukup: track yang baru muncul kembali punya sedikit sampel
        # sehingga simpangannya mudah melonjak. Tanpa syarat ini, wajah yang baru
        # terdeteksi ulang langsung "menang" dan kamera pindah ke orang yang diam.
        and len(cand["ap"]) >= CUT_MIN_SAMPLES
    )
    # PEMUTUS SERI LEWAT SINKRON AUDIO — hanya untuk kasus RAGU.
    # Diukur: skor mulut memisahkan bicara/diam ~10x, jadi menambahkan bobot
    # audio ke skor itu tidak mengubah apa pun (0/602 keputusan berubah pada
    # bobot wajar). Yang benar-benar sulit adalah saat DUA orang skor mulutnya
    # BERDEKATAN — satu bicara, satu tertawa atau bilang "oh". Di situ korelasi
    # aktivitas bibir-audio terukur memisahkan +0.150 (pembicara +0.109 vs yang
    # lain -0.041), jadi dipakai HANYA di sini: kandidat yang skornya cukup dekat
    # boleh menang kalau sinkron audionya jelas lebih baik.
    # Ambang mulut di jalur ini SPEAK_OFF, bukan SPEAK_ON. Alasannya: SPEAK_ON
    # dibuat tinggi supaya derau tidak memindahkan kamera — tapi di jalur ini
    # sudah ada bukti KEDUA yang berdiri sendiri (sinkron audio), jadi bukti
    # mulut tidak perlu sekuat itu. Terukur pada kasus "A bicara, B tertawa":
    # skor mulut keduanya 0.0038 vs 0.0039 (di bawah SPEAK_ON 0.0060), dan tanpa
    # pelonggaran ini pemutus seri tidak pernah aktif.
    if not layak and cand["speak"] >= SPEAK_OFF and len(cand["ap"]) >= CUT_MIN_SAMPLES:
        dekat = cand["speak"] > cur["speak"] * AV_TIE_RATIO
        av_c = float(cand.get("av") or 0.0)
        av_u = float(cur.get("av") or 0.0)
        if dekat and av_c - av_u >= AV_TIE_MARGIN:
            layak = True
    # CATATAN: pernah dicoba "jalur kedua" berbasis skor jangka panjang (2.4 s)
    # supaya kandidat yang mendominasi lama tetap bisa memicu perpindahan meski
    # perbandingan sesaat belum memenuhi DOMINANCE. Diukur pada uji 3 orang:
    # akurasi TIDAK berubah (19/24) tapi jumlah perpindahan kamera naik 4 -> 6
    # dan kamera sempat pindah ke orang yang SALAH (C, bukan B). Dibuang: lebih
    # banyak teleport tanpa tambahan ketepatan.
    # Catatan: TIDAK ada syarat "yang disorot harus sudah diam" (cur < SPEAK_OFF).
    # Syarat itu terbukti menunda perpindahan 2-4 detik: skor orang yang baru
    # berhenti bicara turun perlahan (EMA_DOWN), jadi selama itu kandidat yang
    # sudah jelas bicara tetap ditolak. DOMINANCE + HOLD_FRAMES + cooldown sudah
    # cukup mencegah kamera bolak-balik.
    if not layak:
        state["hold"] = 0
        return cur, False

    if state.get("hold_uid") == cand["uid"]:
        state["hold"] += 1
    else:
        state["hold_uid"] = cand["uid"]
        state["hold"] = 1

    if state["hold"] < HOLD_FRAMES or fi - state["last_cut"] < fps * COOLDOWN_S:
        return cur, False

    state["uid"] = cand["uid"]
    state["hold"] = 0
    state["last_cut"] = fi
    return cand, True


def build_trajectory(targets: list[float], cuts: set[int], src_w: int,
                     crop_w: float, analysis_w: int, fps: float) -> list[float]:
    """Bangun jalur kamera per segmen antar potongan, lalu skala ke piksel sumber.

    ATURAN: KUNCI ATAU IKUTI — tidak ada yang di antaranya.

    Per shot (segmen antar potongan) diputuskan LEBIH DULU apakah kamera perlu
    bergerak sama sekali. Keputusannya dari sebaran posisi target sepanjang shot
    itu, bukan per frame:

    - Sebaran KECIL (orang duduk, cuma gerak tipis, mengangguk, menoleh) →
      kamera DIKUNCI pada satu angka untuk seluruh shot. Nol pergerakan. Bukan
      "hampir nol", tapi benar-benar satu nilai konstan, sehingga tidak ada
      goyangan sedikit pun.
    - Sebaran BESAR (orang jalan, komedi, banyak gerak) → kamera mengikuti
      dengan pegas teredam kritis: mulus, tanpa pantulan, kecepatan dibatasi.

    Pendekatan lama memakai pegas + zona mati untuk SEMUA shot. Masalahnya pegas
    tetap punya kecepatan bukan-nol setiap kali target keluar zona mati sedikit
    saja, lalu masuk lagi — hasilnya kamera bergeser terus dalam amplitudo kecil
    ("goyang-goyang"). Zona mati mengurangi, tidak menghilangkan.

    PERPINDAHAN PEMBICARA = POTONGAN KERAS. Tiap segmen dihitung sendiri dan
    dimulai langsung pada posisi barunya, jadi ganti orang terjadi dalam SATU
    frame — tanpa animasi pan, tanpa mampir ke tengah.
    """
    half = crop_w / 2.0
    scale = src_w / analysis_w
    # zona mati & batas kecepatan dinyatakan relatif LEBAR CROP (dalam satuan
    # piksel analisis) supaya perilakunya sama di resolusi apa pun
    crop_a = crop_w / scale
    deadzone = crop_a * DEADZONE_FRAC
    max_vel = crop_a * MAX_PAN_PER_S / max(1.0, fps)   # px per frame
    omega = 2.0 * math.pi * SPRING_HZ
    dt = 1.0 / max(1.0, fps)
    look = max(1, int(fps * LOOKAHEAD_S))
    still_span = crop_a * STILL_SPAN_FRAC

    def median3(seq: list[float]) -> list[float]:
        if len(seq) < 3:
            return list(seq)
        out = [seq[0]]
        for i in range(1, len(seq) - 1):
            out.append(sorted(seq[i - 1:i + 2])[1])
        out.append(seq[-1])
        return out

    def rentang(seq: list[float]) -> float:
        """Sebaran kokoh: persentil 10-90, bukan min-maks.

        Min-maks membuat satu deteksi melenceng saja memutuskan seluruh shot
        harus bergerak.
        """
        if len(seq) < 4:
            return 0.0
        s = sorted(seq)
        lo = s[int(len(s) * 0.10)]
        hi = s[int(len(s) * 0.90) - 1 if int(len(s) * 0.90) >= len(s) else int(len(s) * 0.90)]
        return float(hi - lo)

    def stabilize(seq: list[float]) -> list[float]:
        """Peredaman kritis EKSAK (SmoothDamp). Untuk shot yang BERGERAK.

        KENAPA BUKAN INTEGRASI EULER DARI PEGAS.
        Versi sebelumnya menghitung `acc = ω²·err − 2ω·v` lalu `v += acc·dt`.
        Pada 15 fps dengan ω = 2π·1,25 = 7,85, hasil ω·dt = 0,52 — sudah di
        ambang ketidakstabilan integrasi Euler eksplisit. Percepatan sesaatnya
        melebihi batas kecepatan pada frame pertama, kecepatan menabrak langit
        (7,42 px/frame = tepat max_vel), lalu redaman menariknya balik. Itu
        menghasilkan jerk terukur 13,3 px/frame² — bergetar, bukan mulus. Ini
        sumber "goyang-goyang" yang dikeluhkan.

        Rumus di bawah adalah solusi ANALITIK sistem teredam kritis untuk satu
        langkah waktu (SmoothDamp, Game Programming Gems 4). Sifatnya: stabil
        tanpa syarat pada dt berapa pun, tidak pernah melewati target, dan
        mendekat secara eksponensial — jadi gerakannya kontinu dan halus.

        smooth_time = perkiraan waktu untuk mencapai target.
        """
        n = len(seq)
        if n == 0:
            return []
        cam = sorted(seq[: min(n, 5)])[min(n, 5) // 2]
        vel = 0.0
        om = 2.0 / max(0.05, SMOOTH_TIME_S)
        x = om * dt
        peluruhan = 1.0 / (1.0 + x + 0.48 * x * x + 0.235 * x * x * x)
        out: list[float] = []
        for i in range(n):
            tgt = seq[min(n - 1, i + look)]
            beda = cam - tgt
            tmp = (vel + om * beda) * dt
            vel = (vel - om * tmp) * peluruhan
            # batas kecepatan pan: kamera tidak boleh menyapu terlalu cepat
            if vel > max_vel:
                vel = max_vel
            elif vel < -max_vel:
                vel = -max_vel
            cam = tgt + (beda + tmp) * peluruhan
            out.append(cam)
        return out

    def zero_phase(seq: list[float], k: int) -> list[float]:
        """Rata-rata bergerak dua arah: mulus TANPA tertinggal di belakang wajah.

        Trajektori dihitung offline, jadi boleh memakai filter non-kausal
        (maju lalu mundur). EMA satu arah menyebabkan kamera selalu tertinggal
        di belakang gerakan wajah — itulah sebab framing dulu terasa "miring".
        """
        if len(seq) < 3 or k < 2:
            return list(seq)
        k = min(k, max(2, len(seq) // 2))
        a = 2.0 / (k + 1)
        cur = list(seq)
        for _ in range(2):
            acc = cur[0]
            fwd = []
            for v in cur:
                acc += (v - acc) * a
                fwd.append(acc)
            acc = fwd[-1]
            bwd = [0.0] * len(fwd)
            for i in range(len(fwd) - 1, -1, -1):
                acc += (fwd[i] - acc) * a
                bwd[i] = acc
            cur = bwd
        return cur

    bounds = [0] + sorted(c for c in cuts if 0 < c < len(targets)) + [len(targets)]
    win = max(3, int(fps * 0.9))
    out: list[float] = []
    for b0, b1 in zip(bounds, bounds[1:]):
        seg = targets[b0:b1]
        if not seg:
            continue
        # 1) buang derau landmark (median + penghalusan dua arah, non-kausal
        #    sehingga tidak menambah keterlambatan)
        bersih = zero_phase(median3(seg), win)
        # 2) PUTUSKAN PER SHOT: kunci atau ikuti.
        if rentang(bersih) <= still_span:
            # KUNCI: satu angka untuk seluruh shot. Median dipakai (bukan
            # rata-rata) supaya frame melenceng tidak menggeser kuncian.
            tetap = sorted(bersih)[len(bersih) // 2]
            out.extend([tetap] * len(seg))
        else:
            out.extend(stabilize(bersih))
    return [max(half, min(src_w - half, x * scale)) for x in out]
