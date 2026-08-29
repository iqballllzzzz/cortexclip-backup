import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

import { cn } from "@/lib/utils";

function clock(seconds: number) {
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.floor(Math.max(0, seconds) % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Preview klip ASLI — video sudah dirender VPS (subtitle gaya terpilih terbakar
 * di dalam file via libass + face tracking aktif), jadi preview == hasil unduhan.
 * Browser hanya memutar file kecil 360x640, bukan streaming sumber 43MB.
 */
export function ClipVideoPreview({
  previewUrl,
  src,
  start,
  end,
  className,
}: {
  previewUrl?: string | null | undefined;
  src: string | null;
  start: number;
  end: number;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);

  // Preview VPS terpotong: mulai dari 0, durasi = panjang file preview (klip penuh).
  // Tanpa preview → fallback streaming sumber + seek (lambat, tapi tetap jalan).
  const usingPreview = Boolean(previewUrl);
  const videoSrc = usingPreview ? previewUrl : src;
  const duration = usingPreview
    ? end - start
    : Math.max(0.1, end - start);

  const seek = useCallback(
    (relative: number) => {
      const video = videoRef.current;
      const clamped = Math.max(0, Math.min(duration, relative));
      setTime(clamped);
      if (video) {
        if (usingPreview) video.currentTime = clamped;
        else video.currentTime = start + clamped;
      }
    },
    [duration, start, usingPreview],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;
    const onLoaded = () => {
      if (usingPreview) video.currentTime = 0;
      else video.currentTime = start;
    };
    const onTime = () => {
      const vtime = video.currentTime;
      const relative = usingPreview ? vtime : vtime - start;
      if (relative >= duration) {
        video.currentTime = usingPreview ? 0 : start;
        setTime(0);
        return;
      }
      setTime(Math.max(0, relative));
    };
    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("timeupdate", onTime);
    return () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("timeupdate", onTime);
    };
  }, [videoSrc, start, duration, usingPreview]);

  function toggle() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      if (usingPreview) {
        if (video.currentTime >= duration) video.currentTime = 0;
      } else if (video.currentTime < start || video.currentTime > end) {
        video.currentTime = start;
      }
      void video.play();
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative aspect-[9/16] w-full overflow-hidden rounded-2xl border border-border bg-primary">
        {videoSrc ? (
          <video
            ref={videoRef}
            src={videoSrc}
            playsInline
            preload="metadata"
            className="absolute inset-0 size-full object-cover"
            onClick={toggle}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-muted-foreground">
            Pilih ulang file video di atas untuk melihat preview asli.
          </div>
        )}

        <div className="absolute left-3 top-3 rounded-full bg-background/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider">
          {usingPreview ? "9:16 · render VPS" : "9:16 · sumber"}
        </div>

        <button
          type="button"
          onClick={toggle}
          disabled={!videoSrc}
          aria-label={playing ? "Jeda" : "Putar"}
          className="absolute bottom-3 left-3 flex size-9 items-center justify-center rounded-full bg-background/85 disabled:opacity-40"
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>
      </div>

      <div className="flex items-center gap-2 text-[11px] tabular-nums text-muted-foreground">
        <span>{clock(time)}</span>
        <input
          type="range"
          min={0}
          max={duration}
          step={0.05}
          value={time}
          disabled={!videoSrc}
          onChange={(e) => seek(Number(e.target.value))}
          className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-[var(--color-accent,#FFD400)]"
          aria-label="Garis waktu klip"
        />
        <span>{clock(duration)}</span>
      </div>
    </div>
  );
}
