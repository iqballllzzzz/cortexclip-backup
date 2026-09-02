import { useEffect, useRef } from "react";

/**
 * BrollPip — jendela b-roll (video stock) di atas video utama.
 *
 * PARITY dengan render unduhan: ffmpeg meng-overlay b-roll di posisi &
 * ukuran yang sama (lebar 78% frame, top 14%), fade masuk/keluar 0.3s.
 * Video di-mute (audio tetap dari klip utama) dan disinkronkan ke waktu
 * lokal placement supaya isi framenya sama dengan hasil render.
 */
export function BrollPip({
  url,
  active,
  localTime,
  width,
  top,
}: {
  url: string;
  active: boolean;
  /** detik sejak placement mulai */
  localTime: number;
  width: number;
  top: number;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (!active) {
      if (!v.paused) v.pause();
      return;
    }
    // sinkron: loop b-roll (mirror -stream_loop -1 di ffmpeg)
    const dur = v.duration;
    if (Number.isFinite(dur) && dur > 0.1) {
      const target = localTime % dur;
      if (Math.abs(v.currentTime - target) > 0.35) v.currentTime = target;
    }
    if (v.paused) void v.play().catch(() => undefined);
  }, [active, localTime]);

  return (
    <video
      ref={ref}
      src={url}
      muted
      playsInline
      preload="metadata"
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-xl object-cover shadow-lg transition-opacity duration-300"
      style={{
        top,
        width,
        height: (width * 9) / 16,
        opacity: active ? 1 : 0,
      }}
    />
  );
}
