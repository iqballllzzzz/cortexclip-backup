"""Status kemajuan preview klip — dibagi ke semua permintaan status.

Kenapa modul terpisah: dipakai oleh main.py (endpoint status) DAN render_clip.py
(pelapor kemajuan), jadi kalau ditaruh di salah satunya akan terjadi impor
melingkar.

Isinya sengaja hanya di MEMORI (bukan DB): kemajuan berubah beberapa kali per
detik dan tidak perlu bertahan setelah proses selesai. Nilai akhir (preview_url
+ preview_ready) tetap disimpan ke DB seperti sebelumnya.

ESTIMASI SELESAI (hitung mundur di UI): laju kemajuan diukur dari riwayat
persen — bukan dari durasi tetap yang ditebak. Alasannya, waktu render sangat
bervariasi (klip 20s vs 90s, wajah 1 vs 2, split atau tidak), jadi angka tetap
akan selalu salah. Yang dipakai: laju rata-rata beberapa titik TERAKHIR
(bukan sejak awal), karena tahap analisis wajah jauh lebih lambat daripada
tahap encode — laju sejak awal akan meremehkan sisa waktu di awal dan
melebih-lebihkannya di akhir.
"""
from __future__ import annotations

import time
from typing import Any

# clip_id -> {"pct", "tahap", "ts", "mulai", "titik": [(ts, pct), ...]}
_state: dict[str, dict[str, Any]] = {}

MAX_AGE_S = 1800.0          # entri lebih tua dari ini dianggap basi
_MAKS_TITIK = 24            # riwayat laju yang disimpan per klip
_JENDELA_LAJU_S = 45.0      # laju dihitung dari titik dalam jendela ini


def set_progress(clip_id: str, pct: int, tahap: str) -> None:
    """Catat kemajuan preview satu klip (dipanggil dari proses render)."""
    pct = max(0, min(100, int(pct)))
    now = time.time()
    row = _state.get(clip_id)
    if not row or now - row.get("ts", 0) > MAX_AGE_S or pct < row.get("pct", 0) - 20:
        # entri baru, atau render dimulai ulang (persen mundur jauh)
        row = {"mulai": now, "titik": []}
        _state[clip_id] = row
    # simpan titik hanya kalau persennya maju — titik dengan persen sama
    # membuat laju terlihat nol dan estimasi meledak jadi tak terhingga
    if not row["titik"] or pct > row["titik"][-1][1]:
        row["titik"].append((now, pct))
        if len(row["titik"]) > _MAKS_TITIK:
            del row["titik"][:-_MAKS_TITIK]
    # PALANG MONOTON: dalam satu render, persen TIDAK BOLEH turun. Mundur kecil
    # (<=20%) terjadi karena fase berbeda memakai skala berbeda — mis. fase
    # unduh melapor 6% lalu fase analisis mulai dari 5%. Terukur di E2E:
    # [4,4,5,6,6,5,12,...] — turunnya cuma 1% tapi pengguna tetap melihat
    # "kok mundur". Mundur >20% sudah ditangani di atas sebagai render ulang.
    row["pct"] = max(pct, int(row.get("pct", 0)))
    row["tahap"] = tahap
    row["ts"] = now


def _eta_detik(row: dict[str, Any]) -> int | None:
    """Perkiraan sisa detik, atau None kalau belum bisa dihitung."""
    pct = int(row.get("pct", 0))
    if pct >= 100:
        return 0
    titik = row.get("titik") or []
    if len(titik) < 2:
        return None
    now = time.time()
    # ambil titik dalam jendela terakhir; kalau kurang dari 2, pakai 2 terakhir
    baru = [t for t in titik if now - t[0] <= _JENDELA_LAJU_S]
    if len(baru) < 2:
        baru = titik[-2:]
    dt = baru[-1][0] - baru[0][0]
    dp = baru[-1][1] - baru[0][1]
    if dt <= 0.5 or dp <= 0:
        return None
    laju = dp / dt                     # persen per detik
    sisa = (100 - pct) / laju
    # kalau sudah lama tidak ada kemajuan, tambahkan diamnya ke estimasi supaya
    # hitung mundur tidak berbohong "3 detik" padahal macet 40 detik
    diam = now - row.get("ts", now)
    if diam > 3:
        sisa += diam
    return int(max(1, min(1800, round(sisa))))


def get_progress(clip_id: str) -> dict[str, Any] | None:
    """Kemajuan terakhir + estimasi sisa detik, atau None kalau basi."""
    row = _state.get(clip_id)
    if not row:
        return None
    if time.time() - row["ts"] > MAX_AGE_S:
        _state.pop(clip_id, None)
        return None
    return {"pct": row["pct"], "tahap": row["tahap"],
            "eta_s": _eta_detik(row),
            "elapsed_s": int(time.time() - row.get("mulai", row["ts"]))}


def clear_progress(clip_id: str) -> None:
    _state.pop(clip_id, None)


def set_gagal(clip_id: str, pesan: str) -> None:
    """Tandai render preview GAGAL supaya UI berhenti mengulang tanpa akhir.

    Keluhan pengguna: "5 persen terus jadi 3 persen terus langsung 60 persen
    terus nurun lagi jadi 3 persen, gaada habisnya". Sebabnya ffmpeg gagal,
    task mati, status berubah "idle", lalu klien memulai render baru dari nol —
    berulang tanpa pernah memberi tahu bahwa ada yang salah. Dengan penanda ini
    endpoint status membalas status="failed" + pesan, dan klien berhenti
    mengulang serta menampilkan penyebabnya.
    """
    row = _state.get(clip_id) or {}
    row.update({"gagal": True, "pesan": pesan[:300], "t_gagal": time.time()})
    _state[clip_id] = row


def ambil_gagal(clip_id: str) -> dict[str, Any] | None:
    """Kembalikan info kegagalan kalau masih segar (<5 menit)."""
    row = _state.get(clip_id)
    if not row or not row.get("gagal"):
        return None
    if time.time() - float(row.get("t_gagal", 0)) > 300:
        _state.pop(clip_id, None)
        return None
    return {"pesan": row.get("pesan") or "Render gagal"}
