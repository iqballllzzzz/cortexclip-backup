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

from typing import Any, Optional

from .speaker_track import (COOLDOWN_S, CUT_MIN_SAMPLES, DOMINANCE,
                            HOLD_FRAMES, LOST_HOLD_S, SPEAK_ON, STICKY_S)


def pick_active(live: list[dict[str, Any]], state: dict[str, Any], fi: int,
                fps: float, all_tracks: Optional[list[dict[str, Any]]] = None,
                ) -> tuple[Optional[dict[str, Any]], bool]:
    """Pilih wajah yang disorot. Balik (track, apakah_ini_potongan)."""
    if not live:
        return None, False

    cur = None
    if state["uid"] is not None:
        cur = next((t for t in live if t["uid"] == state["uid"]), None)
        if cur is None and all_tracks:
            # Wajah yang disorot HILANG dari daftar kandidat (deteksi bolong,
            # kepala menoleh, tertutup mikrofon).
            #
            # Bertahan di posisi terakhirnya BOLEH, tapi hanya SEBENTAR. Dulu
            # tidak ada batasnya sama sekali: selama identitas masih hidup
            # (LOST_S = 3 detik) kamera terus menatap tempat orang itu TADI
            # berada. Terukur pada podcast nyata: kamera macet di x=270 selama
            # 2,4 detik sementara satu-satunya wajah yang terlihat ada di x=424
            # — wajahnya 79% lebar crop di luar pusat, alias kamera menyorot
            # ruang kosong. Itu persis keluhan user.
            #
            # Sekarang: kalau lewat LOST_HOLD_S dan ADA wajah lain yang terlihat,
            # kamera berpindah ke wajah itu dengan potongan tegas.
            stale = next((t for t in all_tracks
                          if t["uid"] == state["uid"]), None)
            if stale is not None:
                diam = fi - stale["last"]
                if diam <= fps * LOST_HOLD_S:
                    return stale, False
                # Sudah lama hilang. Pindah HANYA kalau tidak ada keraguan:
                # tepat SATU wajah yang terlihat. Itu pasti pembicaranya —
                # sudut kamera sumber berganti dan orang lain tidak ada di
                # frame. Terukur pada podcast nyata: tanpa ini kamera menatap
                # posisi lama 2,4 detik sementara satu-satunya wajah ada 79%
                # lebar crop di sebelahnya.
                #
                # Kalau wajah yang terlihat LEBIH DARI SATU, memaksa pindah
                # justru berbahaya: pilihannya jatuh ke wajah terbesar/skor
                # tertinggi yang belum tentu pembicara, lalu kamera TERKUNCI di
                # sana (uji 3 orang jatuh 100% → 33%). Untuk kasus itu tetap
                # bertahan dan biarkan aturan dominasi bicara yang memutuskan.
                if len(live) == 1:
                    pick = live[0]
                    state["uid"] = pick["uid"]
                    state["hold"] = 0
                    state["last_cut"] = fi
                    return pick, True
                return stale, False

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
    """Haluskan target per segmen antar potongan, lalu skala ke piksel sumber."""
    half = crop_w / 2.0
    scale = src_w / analysis_w

    def median3(seq: list[float]) -> list[float]:
        if len(seq) < 3:
            return list(seq)
        out = [seq[0]]
        for i in range(1, len(seq) - 1):
            out.append(sorted(seq[i - 1:i + 2])[1])
        out.append(seq[-1])
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
        out.extend(zero_phase(median3(seg), win))
    return [max(half, min(src_w - half, x * scale)) for x in out]
