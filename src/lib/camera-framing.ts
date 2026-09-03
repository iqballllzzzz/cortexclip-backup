/**
 * Bingkai kamera untuk video SUMBER di browser — preview instan tanpa render.
 *
 * Editor sudah memutar video sumber (16:9) di dalam kotak 9:16 dengan
 * `object-fit: cover`, jadi browser memotong bagian tengah. Pada podcast dua
 * orang, tengah frame justru RUANG KOSONG di antara mereka — itu yang terlihat
 * di screenshot user.
 *
 * Perbaikannya tidak perlu render server: `object-position` bisa menggeser
 * jendela potongan itu. Backend mengirim posisi kamera (piksel sumber), hook ini
 * mengubahnya jadi persen dan memperbaruinya per frame sesuai waktu video —
 * jadi framing benar SEJAK DETIK PERTAMA, dan kameranya ikut berpindah saat
 * pembicara berganti.
 */
import { useEffect, useRef, useState } from "react";

export type CameraTrack = {
  src_w?: number;
  src_h?: number;
  crop_w?: number;
  static_x?: number;
  fps?: number;
  x?: number[];
  cuts?: number[];
  quick?: boolean;
};

/** Ubah posisi kamera (px sumber) jadi object-position X dalam persen. */
export function camXToPercent(cx: number, srcW: number, cropW: number): number {
  const span = Math.max(1, srcW - cropW);
  // object-position 0% = tepi kiri jendela di x=0; 100% = tepi kanan di srcW
  const pct = ((cx - cropW / 2) / span) * 100;
  return Math.max(0, Math.min(100, pct));
}

/**
 * Terapkan jalur kamera ke elemen <video>.
 *
 * enabled=false (mis. yang diputar adalah preview hasil render server, yang
 * SUDAH terpotong) → object-position dikembalikan ke tengah supaya tidak
 * digeser dua kali.
 */
export function useCameraFraming(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  track: CameraTrack | null,
  opts: { enabled: boolean; clipStart: number },
) {
  const { enabled, clipStart } = opts;
  const raf = useRef<number | null>(null);
  const lastPct = useRef<number>(-1);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (!enabled || !track?.src_w || !track?.crop_w) {
      v.style.objectPosition = "50% 50%";
      return;
    }
    const srcW = track.src_w;
    const cropW = track.crop_w;
    const xs = track.x;
    const fps = track.fps ?? 15;

    const setPct = (pct: number) => {
      // hanya tulis kalau berubah > 0.05% — menghindari layout thrash 60x/detik
      if (Math.abs(pct - lastPct.current) < 0.05) return;
      lastPct.current = pct;
      v.style.objectPosition = `${pct.toFixed(2)}% 50%`;
    };

    // tanpa jalur per-frame: satu offset statis sudah cukup untuk membingkai
    if (!xs || xs.length < 2) {
      const sx = track.static_x ?? srcW / 2;
      setPct(camXToPercent(sx, srcW, cropW));
      return;
    }

    const tick = () => {
      // waktu video sumber bersifat ABSOLUT; jalur kamera relatif ke awal klip
      const rel = Math.max(0, (v.currentTime || 0) - clipStart);
      const i = Math.min(xs.length - 1, Math.max(0, Math.round(rel * fps)));
      setPct(camXToPercent(xs[i] ?? srcW / 2, srcW, cropW));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      raf.current = null;
    };
  }, [videoRef, track, enabled, clipStart]);
}

/** Ambil jalur kamera dari backend; balik null selama belum siap. */
export function useCameraTrack(clipId: string | undefined, token: () => Promise<string>) {
  const [track, setTrack] = useState<CameraTrack | null>(null);

  useEffect(() => {
    if (!clipId) return;
    let mati = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function ambil(putaran: number) {
      try {
        const t = await token();
        const res = await fetch(`/api/camera-track/${clipId}`, {
          headers: { Authorization: `Bearer ${t}` },
        });
        if (!res.ok || mati) return;
        const d: CameraTrack & { error?: string } = await res.json();
        if (d.error || mati) return;
        setTrack(d);
        // hasil kilat (static_x saja) akan digantikan analisis penuh (x[]);
        // cek beberapa kali lalu berhenti supaya tidak polling selamanya
        if (!d.x && putaran < 12) {
          timer = setTimeout(() => void ambil(putaran + 1), 5000);
        }
      } catch {
        /* offline: editor tetap jalan dengan crop tengah */
      }
    }
    void ambil(0);
    return () => {
      mati = true;
      if (timer) clearTimeout(timer);
    };
  }, [clipId, token]);

  return track;
}
