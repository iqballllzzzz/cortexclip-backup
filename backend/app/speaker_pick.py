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

from .speaker_track import (AV_TIE_MARGIN, AV_TIE_RATIO, BIG_MOVE_FRAC,
                            COOLDOWN_GESER_S, COOLDOWN_S, CUT_MIN_SAMPLES,
                            DEADZONE_FRAC, DOMINANCE, DWELL_S, HOLD_FRAMES,
                            LOOKAHEAD_S, LOST_HOLD_S, MAX_PAN_PER_S,
                            RECENT_FRAMES, SETTLE_FRAC, SMOOTH_TIME_S,
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
    # BATAS KECEPATAN dalam px per DETIK, bukan per frame.
    # SmoothDamp menyimpan kecepatan per detik (rumusnya mengalikan vel dengan
    # dt). Versi sebelumnya membaginya lagi dengan fps, jadi kamera dijepit pada
    # 7.4 px/detik alih-alih 111 px/detik — 15x lebih lambat dari yang dimaksud.
    # Akibatnya kamera tidak pernah menyusul subjek yang berjalan: terukur masih
    # 12 px dari target setelah 6 detik, dan gerakannya terasa berat/tertinggal.
    max_vel = crop_a * MAX_PAN_PER_S
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

    def stabilize(seq: list[float], profile: str = "TERATUR") -> list[float]:
        """KUNCI → GESER → KUNCI ulang (Smart Adaptive Stabilizer).
        Untuk shot yang subjeknya berpindah tempat secara nyata.
        """
        n = len(seq)
        if n == 0:
            return []
        big = BIG_MOVE_FRAC * crop_a        # ambang "orangnya pindah tempat"
        settle = SETTLE_FRAC * crop_a       # sudah cukup dekat → kunci lagi
        dwell = max(2, int(fps * DWELL_S))  # harus bertahan sekian frame

        # Adaptasi waktu redam sesuai profil gerak:
        # Gerak teratur -> lebih halus & tenang (1.3x)
        # Gerak kencang & tak beraturan -> responsif & meredam getaran
        st_time = SMOOTH_TIME_S * 1.30 if profile == "TERATUR" else SMOOTH_TIME_S * 0.90
        om = 2.0 / max(0.05, st_time)
        x = om * dt
        peluruhan = 1.0 / (1.0 + x + 0.48 * x * x + 0.235 * x * x * x)

        # POSISI MENETAP, bukan posisi sesaat.
        wdw = dwell
        menetap: list[float] = []
        for i in range(n):
            a = max(0, i - wdw + 1)
            pot = sorted(seq[a:i + 1])
            menetap.append(pot[len(pot) // 2])

        cam = sorted(seq[: min(n, 5)])[min(n, 5) // 2]
        vel = 0.0
        geser = False
        lama = 0                            # berapa frame target sudah jauh
        cooldown = 0                        # frame tersisa sebelum boleh geser lagi
        out: list[float] = []
        for i in range(n):
            tgt = seq[min(n - 1, i + look)]
            beda_tetap = abs(menetap[min(n - 1, i + look)] - cam)
            if cooldown > 0:
                cooldown -= 1
            if not geser:
                lama = lama + 1 if (beda_tetap > big and cooldown == 0) else 0
                if lama >= dwell:
                    geser = True
                    lama = 0
                    vel = 0.0
                else:
                    out.append(cam)         # PERSIS diam, bukan "hampir diam"
                    continue
            # GESER: peredaman kritis analitik menuju target
            beda = cam - tgt
            tmp = (vel + om * beda) * dt
            vel = (vel - om * tmp) * peluruhan
            if vel > max_vel:
                vel = max_vel
            elif vel < -max_vel:
                vel = -max_vel
            cam = tgt + (beda + tmp) * peluruhan
            out.append(cam)

            j = min(n - 1, i + look)
            k0 = max(0, j - max(2, int(fps * 0.2)))
            laju = abs(seq[j] - seq[k0]) / max(1, j - k0)
            if abs(tgt - cam) <= settle and laju <= settle * 0.12:
                geser = False               # sudah sampai → kunci di posisi ini
                vel = 0.0
                cooldown = max(dwell, int(fps * COOLDOWN_GESER_S))
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

    def analyze_motion_profile(seq: list[float]) -> str:
        """Deteksi profil pergerakan (Smart Stabilizer):
        - 'DIAM': gerakan minim atau jarang-jarang (orang duduk/bicara santai) -> KUNCI TOTAL (0 px goyang)
        - 'TERATUR': gerakan satu arah atau perpindahan teratur -> peredaman halus tanpa sentakan
        - 'KENCANG_TAK_BERATURAN': gerakan cepat & acak (banyak gerak/loncat) -> gimbal stabilizer aktif
        """
        if len(seq) < 4:
            return "DIAM"
        sp = rentang(seq)
        if sp <= still_span:
            return "DIAM"

        diffs = [seq[i] - seq[i - 1] for i in range(1, len(seq))]
        vels = [abs(d) for d in diffs]

        # Hitung pergantian arah (reversals): mendeteksi getaran/gerak bolak-balik acak
        reversals = sum(1 for i in range(1, len(diffs)) if diffs[i] * diffs[i - 1] < -1e-5)
        reversal_ratio = reversals / max(1, len(diffs))

        if reversal_ratio > 0.28 and max(vels) > 0.035 * crop_a:
            return "KENCANG_TAK_BERATURAN"

        return "TERATUR"

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
        # 2) PUTUSKAN PER SHOT: Smart Stabilizer
        profile = analyze_motion_profile(bersih)
        if profile == "DIAM":
            # KUNCI TOTAL: satu angka untuk seluruh shot (0 px goyang)
            tetap = sorted(bersih)[len(bersih) // 2]
            out.extend([tetap] * len(seg))
        else:
            out.extend(stabilize(bersih, profile=profile))

    # ===== GUARD AKURASI (keluhan: "face tracking gak pas ke orangnya, yang
    # terlihat cuman pundaknya doang") =====
    # Bandingkan jalur kamera dengan target wajah asli per segmen. Kalau
    # MEDIAN jarak kamera→wajah pada segmen melebihi 35% lebar crop, kamera
    # jelas menatap yang salah (median dipilih supaya frame melenceng tidak
    # memicu). Perbaiki dengan MENCIUM posisi target segmen itu (bukan pan
    # panjang): satu frame snap, seperti perpindahan pembicara.
    guard = crop_a * 0.35

    def perbaiki(b0: int, b1: int, kedalaman: int) -> list[float]:
        """Kalau kamera salah target di segmen ini, pecah di lompatan target
        terbesar lalu kunci ulang per bagian (rekursif, maks 6 kedalaman)."""
        seg_out = out[b0:b1]
        seg_tgt = targets[b0:b1]
        if not seg_out or b1 - b0 < 4:
            return list(seg_out)
        valid = [t for t in seg_tgt if t is not None]
        if not valid:
            return list(seg_out)
        pasangan = [(o, t) for o, t in zip(seg_out, seg_tgt) if t is not None]
        jarak = sorted(abs(o - t) for o, t in pasangan)
        # P90 (bukan median): salah yang menetap (≥10% segmen) harus terdeteksi,
        # sementara frame melenceng sesaat (<10%) tidak memicu pemecahan.
        p90 = jarak[min(len(jarak) - 1, int(len(jarak) * 0.9))]
        if p90 <= guard:
            return list(seg_out)              # kamera benar — biarkan
        if kedalaman >= 6:
            med_t = sorted(valid)[len(valid) // 2]
            return [med_t] * (b1 - b0)        # darurat: satu kuncian
        # cari titik lompatan target terbesar → batas sub-bagian baru
        terbaik, delta_terbaik = None, 0.0
        for i in range(b0 + 2, b1 - 2):
            a, b = targets[i - 1], targets[i]
            if a is None or b is None:
                continue
            d = abs(b - a)
            if d > delta_terbaik:
                delta_terbaik, terbaik = d, i
        if terbaik is None or delta_terbaik < guard:
            # tidak ada lompatan jelas → kunci ulang seluruh segmen ke median
            med_t = sorted(valid)[len(valid) // 2]
            return [med_t] * (b1 - b0)
        kiri = perbaiki(b0, terbaik, kedalaman + 1)
        kanan = perbaiki(terbaik, b1, kedalaman + 1)
        return kiri + kanan

    # konversi ke piksel SUMBER + clamp SEKALI di sini, lalu guard membandingkan
    # dalam satuan sumber — target juga di-clamp (wajah di luar jangkauan crop
    # bukan kesalahan kamera)
    sumber = [max(half, min(src_w - half, x * scale)) for x in out]
    sasaran = [max(half, min(src_w - half, t * scale))
               for t in (targets if targets else [])]

    def perbaiki_sumber(b0: int, b1: int, kedalaman: int) -> list[float]:
        seg = sumber[b0:b1]
        tgt = sasaran[b0:b1]
        if not seg or b1 - b0 < 4 or not tgt:
            return list(seg)
        pasangan = [(o, t) for o, t in zip(seg, tgt) if t is not None]
        if not pasangan:
            return list(seg)
        jarak = sorted(abs(o - t) for o, t in pasangan)
        p90 = jarak[min(len(jarak) - 1, int(len(jarak) * 0.9))]
        if p90 <= guard_s:
            return list(seg)
        if kedalaman >= 6:
            med = sorted(t for t in tgt if t is not None)
            m = med[len(med) // 2]
            print(f"[face-track] guard: segmen {b0}-{b1} salah target "
                  f"(p90 {p90:.0f}px > {guard_s:.0f}px) → kunci {m:.0f}")
            return [m] * (b1 - b0)
        terbaik, delta_terbaik = None, 0.0
        for i in range(b0 + 2, b1 - 2):
            a, b = sasaran[i - 1], sasaran[i]
            if a is None or b is None:
                continue
            d = abs(b - a)
            if d > delta_terbaik:
                delta_terbaik, terbaik = d, i
        if terbaik is None or delta_terbaik < guard_s:
            med = sorted(t for t in tgt if t is not None)
            m = med[len(med) // 2]
            print(f"[face-track] guard: segmen {b0}-{b1} salah target tanpa "
                  f"lompatan jelas → kunci {m:.0f}")
            return [m] * (b1 - b0)
        kiri = perbaiki_sumber(b0, terbaik, kedalaman + 1)
        kanan = perbaiki_sumber(terbaik, b1, kedalaman + 1)
        return kiri + kanan

    guard_s = (crop_w * 1.0) * 0.35   # 35% lebar crop (piksel sumber)
    hasil: list[float] = []
    for b0, b1 in zip(bounds, bounds[1:]):
        segmen = perbaiki_sumber(b0, b1, 0)
        if len(segmen) != b1 - b0:
            hasil.extend(sumber[b0:b1])
        else:
            hasil.extend(segmen)
    return hasil
