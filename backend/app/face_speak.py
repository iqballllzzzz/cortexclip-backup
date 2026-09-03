"""Skor bicara dari landmark mulut YuNet + energi audio — langkah 2 pipeline.

MULUT: YuNet memberi dua sudut mulut. Jarak antar sudut itu saja tidak cukup
(berubah saat kepala menoleh), jadi yang dipakai adalah RASIO jarak sudut-mulut
terhadap jarak antar-mata pada wajah yang SAMA — bebas skala dan bebas jarak
kamera. Orang bicara: rasio itu naik-turun terus; orang diam: hampir rata.
Skor = simpangan baku rasio dalam jendela waktu.

AUDIO: energi suara per frame diambil sekali untuk seluruh klip (ffmpeg astats,
satu proses). Audio TIDAK bisa menentukan SIAPA yang bicara, tapi bisa
menentukan APAKAH ada yang bicara: pada frame senyap semua skor mulut ditekan,
sehingga gerakan mulut yang bukan bicara (mengunyah, tersenyum, menguap) tidak
memindahkan kamera. Ini pengganti hemat untuk TalkNet/Light-ASD yang butuh GPU.
"""
from __future__ import annotations

import math
import re
import subprocess
from typing import Any, Optional

import numpy as np

WIN_FRAMES = 9            # jendela penilaian 0.6s @15fps
MIN_SAMPLES = 4
EMA_UP = 0.85
EMA_DOWN = 0.30
SPEAK_ON = 0.0060         # ambang simpangan bukaan bibir (FaceMesh ROI)
SPEAK_OFF = 0.0035
AUDIO_GATE = 0.10         # energi audio di bawah 10% puncak = senyap
ROI_SIZE = 192            # ROI wajah diskalakan ke ukuran tetap ini


def mouth_ratio(det: dict[str, Any]) -> float:
    """Bukaan mulut relatif jarak antar-mata (bebas skala & jarak kamera)."""
    (erx, ery), (elx, ely) = det["eye_r"], det["eye_l"]
    (mrx, mry), (mlx, mly) = det["mouth_r"], det["mouth_l"]
    eye = math.hypot(elx - erx, ely - ery)
    if eye < 4.0:
        # Wajah terlalu kecil / landmark bertumpuk: rasio jadi liar (pembagi
        # mendekati nol). Terukur sebelum penjagaan ini: skor melonjak 3.8 dan
        # 4.0 pada wajah kecil, mengalahkan pembicara sesungguhnya.
        return 0.0
    mcx, mcy = (mrx + mlx) / 2.0, (mry + mly) / 2.0
    ecx, ecy = (erx + elx) / 2.0, (ery + ely) / 2.0
    r = math.hypot(mcx - ecx, mcy - ecy) / eye
    # rasio wajar 0.6-2.5; di luar itu landmark tidak dipercaya
    return r if 0.3 <= r <= 4.0 else 0.0


def audio_envelope(src: str, start: float, dur: float, fps: float,
                   run_ffmpeg) -> Optional[np.ndarray]:
    """Energi audio ter-normalisasi per frame analisis. None kalau tidak ada audio."""
    try:
        # RMS per jendela pendek → satu nilai per frame analisis
        out = run_ffmpeg(
            ["ffmpeg", "-v", "error", "-ss", f"{start:.3f}", "-t", f"{dur:.3f}",
             "-i", src, "-vn", "-ac", "1", "-ar", "16000",
             "-f", "s16le", "-"], timeout=300).stdout
    except Exception as exc:
        print(f"[speak-audio] gagal ambil audio: {str(exc)[:120]}")
        return None
    if not out or len(out) < 3200:
        return None
    pcm = np.frombuffer(out, dtype=np.int16).astype(np.float32) / 32768.0
    per = max(1, int(16000 / max(1.0, fps)))
    n = len(pcm) // per
    if n < 2:
        return None
    rms = np.sqrt((pcm[: n * per].reshape(n, per) ** 2).mean(axis=1))
    top = float(np.percentile(rms, 95))
    if top < 1e-5:
        return None
    return np.clip(rms / top, 0.0, 1.5)


def lip_aperture_roi(frame_rgb: np.ndarray, track: dict[str, Any]
                     ) -> Optional[float]:
    """Bukaan bibir dari FaceMesh pada ROI satu track.

    KENAPA PERLU: YuNet hanya memberi SUDUT mulut, bukan bibir atas/bawah. Jarak
    mata-ke-mulut memang naik saat rahang turun, tapi sinyalnya lemah — pada
    video uji 3 orang skornya cuma 0.007-0.08 dan pemisahan bicara/diam kabur
    (akurasi jatuh 100% -> 58%). FaceMesh memberi bibir dalam atas & bawah, dan
    itu terukur memisahkan ~10x (bicara 0.023 vs diam 0.002).

    Jadi: YuNet untuk MENEMUKAN & MELACAK wajah (recall 100%, plus mata untuk
    deroll), FaceMesh untuk MENGUKUR mulut pada potongan kecil di sekitar wajah
    yang sudah ditemukan. Masing-masing dipakai untuk yang terbaik.
    """
    from .speaker_detect import _get_roi_mesh
    from .speaker_track import FACE_CHIN, FACE_TOP, LIP_BOT, LIP_TOP

    h, w = frame_rgb.shape[:2]
    b = track["box"]
    pad = 0.22 * max(b["x2"] - b["x1"], b["y2"] - b["y1"])
    # ROI DIBULATKAN ke kisi 8 piksel. Alasannya penting: FaceMesh mengeluarkan
    # landmark yang berbeda kalau potongan masukannya bergeser satu piksel. Wajah
    # yang benar-benar DIAM pun jadi tampak bergerak, dan simpangan jendela
    # naik ke 0.010 — di atas SPEAK_ON, sehingga orang yang tidak bicara ikut
    # dinilai bicara (terukur: panel beku dinilai 0.0367). Dengan dibulatkan,
    # goyangan 1-2 piksel tidak mengubah potongan sama sekali, jadi wajah diam
    # menghasilkan simpangan mendekati nol.
    q = 8
    x0 = int(max(0, b["x1"] - pad)) // q * q
    y0 = int(max(0, b["y1"] - pad)) // q * q
    x1 = min(w, -(-int(b["x2"] + pad) // q) * q)
    y1 = min(h, -(-int(b["y2"] + pad) // q) * q)
    if x1 - x0 < 32 or y1 - y0 < 32:
        return None
    try:
        roi = frame_rgb[y0:y1, x0:x1]
        # ROI DINORMALKAN ke ukuran tetap sebelum masuk FaceMesh. Dua alasan:
        # (1) tingkat keberhasilan naik — wajah kecil (80-90 px) sering gagal pada
        #     ukuran aslinya, dan setiap kegagalan menunda pengumpulan sampel
        #     sehingga perpindahan kamera terlambat 1.8-2.8 detik;
        # (2) landmark jadi konsisten antar frame — potongan berukuran berubah
        #     menghasilkan interpolasi berbeda, yang tampak seperti mulut bergerak
        #     padahal wajahnya diam.
        import cv2
        if roi.shape[0] != ROI_SIZE or roi.shape[1] != ROI_SIZE:
            roi = cv2.resize(roi, (ROI_SIZE, ROI_SIZE),
                             interpolation=cv2.INTER_LINEAR)
        res = _get_roi_mesh().process(np.ascontiguousarray(roi))
    except Exception:
        return None
    faces = res.multi_face_landmarks or []
    if not faces:
        return None
    lm = faces[0].landmark
    rh = y1 - y0
    fh = abs(lm[FACE_CHIN].y - lm[FACE_TOP].y) * rh
    if fh < 8:
        return None
    return abs(lm[LIP_BOT].y - lm[LIP_TOP].y) * rh / fh


def commit_speak(tracks: list[dict[str, Any]], fi: int,
                 audio: Optional[np.ndarray] = None) -> None:
    """Perbarui skor bicara semua track pada frame fi."""
    gate = 1.0
    if audio is not None and 0 <= fi < len(audio):
        a = float(audio[fi])
        # senyap → tekan skor; ada suara → biarkan
        gate = 0.0 if a < AUDIO_GATE else min(1.0, a / max(1e-6, AUDIO_GATE * 2))
    for t in tracks:
        t["ap"] = [(f, v) for (f, v) in t["ap"] if fi - f < WIN_FRAMES]
        if len(t["ap"]) < MIN_SAMPLES:
            t["speak"] *= (1.0 - EMA_DOWN)
            continue
        vals = np.asarray([v for (_f, v) in t["ap"]], dtype=np.float32)
        score = float(vals.std()) * gate
        a = EMA_UP if score > t["speak"] else EMA_DOWN
        t["speak"] = t["speak"] * (1 - a) + score * a
        # skor jangka panjang dihapus: lihat catatan di speaker_pick.py


def push_sample(t: dict[str, Any], fi: int, det: dict[str, Any],
                frame_rgb: Optional[np.ndarray] = None) -> None:
    """Catat satu sampel bukaan mulut ke riwayat track.

    ATURAN PENTING: satu track TIDAK BOLEH mencampur dua skala pengukuran.
    Bukaan bibir FaceMesh berkisar 0.00-0.05; rasio landmark YuNet berkisar
    1.5-4.0 (dua ratus kali lebih besar). Saat FaceMesh gagal pada satu frame dan
    nilai YuNet disisipkan sebagai pengganti, simpangan jendela meledak dan track
    yang DIAM langsung menang: terukur skor 1.2 untuk panel yang tidak bicara,
    sementara pembicara sesungguhnya hanya 0.04. Akurasi jatuh ke 29%.

    Jadi: kalau frame tersedia, HANYA FaceMesh yang dipakai; frame yang gagal
    diukur dilewati (jendela sudah tahan terhadap sampel bolong lewat
    MIN_SAMPLES). Rasio YuNet dipakai hanya kalau memang tidak ada frame sama
    sekali — dan dalam mode itu semua track memakai skala yang sama.
    """
    if frame_rgb is not None:
        v = lip_aperture_roi(frame_rgb, t)
        if v is None:
            return                      # lewati, jangan campur skala
    else:
        v = mouth_ratio(det)
    t["ap"].append((fi, v))
    t["ap"] = [(f, x) for (f, x) in t["ap"] if fi - f < WIN_FRAMES]
