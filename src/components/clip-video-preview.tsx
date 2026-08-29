import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

import { cn } from "@/lib/utils";
import type { CaptionStyle } from "@/components/caption-preview";

export interface PreviewWord {
  word: string;
  start: number;
  end: number;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += Math.max(1, size)) out.push(items.slice(i, i + size));
  return out;
}

function clock(seconds: number) {
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.floor(Math.max(0, seconds) % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Preview klip nyata: video sumber dipotong 9:16 (crop tengah) dan diputar
 * hanya pada rentang klip, dengan caption karaoke yang sinkron ke waktu video.
 */
export function ClipVideoPreview({
  src,
  previewUrl,
  start,
  end,
  words,
  style,
  className,
}: {
  src: string | null;
  previewUrl?: string | null;
  start: number;
  end: number;
  words: PreviewWord[];
  style: CaptionStyle;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);

  // Preview VPS terpotong: video dimulai dari 0, durasi = panjang file preview.
  // Caption tetap pakai jendela klip asli [start, end].
  const usingPreview = Boolean(previewUrl);
  const videoSrc = usingPreview ? previewUrl : src;
  const videoDuration = usingPreview ? Math.min(end - start, 12) : Math.max(0.1, end - start);
  // offset: waktu caption asli = offset + waktu video preview
  const captionOffset = usingPreview ? start : start;
  const duration = videoDuration;

  const lines = chunk(words, style.wordsPerLine);

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
      if (!usingPreview && relative >= duration) {
        video.currentTime = start;
        setTime(0);
        return;
      }
      if (usingPreview && vtime >= duration) {
        video.currentTime = 0;
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

  // Waktu caption: preview terpotong → video 0..durasiPreview dipetakan ke start..start+durasiPreview
  const captionTime = usingPreview ? captionOffset + time : time;

  const activeLine =
    lines.find((line) => captionTime >= line[0]!.start && captionTime <= line[line.length - 1]!.end) ??
    lines.find((line) => captionTime < line[0]!.start);

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
          {usingPreview ? "9:16 · preview instan" : "9:16 · crop tengah"}
        </div>

        {activeLine ? (
          <div
            className="absolute inset-x-0 flex flex-wrap justify-center gap-x-2 gap-y-1 px-3 text-center"
            style={{ top: `${style.position}%` }}
          >
            {activeLine.map((w, i) => {
              const state = time > w.end ? "past" : time >= w.start ? "active" : "future";
              return (
                <span
                  key={`${w.word}-${i}`}
                  data-state={state}
                  className="caption-word"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: `${style.fontSize}px`,
                    lineHeight: 1.1,
                    color: state === "active" ? style.accent : style.base,
                    WebkitTextStroke: style.stroke ? "1.5px rgba(0,0,0,0.85)" : undefined,
                    textShadow: style.stroke ? "0 3px 0 rgba(0,0,0,0.55)" : undefined,
                  }}
                >
                  {w.word}
                </span>
              );
            })}
          </div>
        ) : null}

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
