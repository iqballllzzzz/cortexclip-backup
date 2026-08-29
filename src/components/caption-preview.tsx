import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AlertTriangle, Clock, Coins, Sparkles, TrendingUp } from "lucide-react";
import type { CaptionWord, DemoClip } from "@/data/demo-clips";
import { getPreset } from "@/components/subtitle-styles";
import { cn } from "@/lib/utils";

const icons = {
  clock: Clock,
  trend: TrendingUp,
  alert: AlertTriangle,
  coins: Coins,
  spark: Sparkles,
};

export interface CaptionStyle {
  accent: string;
  base: string;
  fontSize: number;
  wordsPerLine: number;
  position: number;
  stroke: boolean;
  showOverlays: boolean;
  /** Gaya subtitle preset (8 gaya) — sumber utama; efek/warna aktif ditentukan preset */
  preset: string;
  /** Subtitle effect style */
  effect: "none" | "glow" | "pop" | "box";
  /** Uppercase all captions */
  uppercase: boolean;
  /** Enable face tracking visualization */
  showFaceTracking: boolean;
}

export const defaultCaptionStyle: CaptionStyle = {
  accent: "#FFD400",
  base: "#FFFFFF",
  fontSize: 30,
  wordsPerLine: 3,
  position: 62,
  stroke: true,
  showOverlays: true,
  preset: "hormozi",
  effect: "glow",
  uppercase: false,
  showFaceTracking: true,
};

function chunk(words: CaptionWord[], size: number) {
  const out: CaptionWord[][] = [];
  for (let i = 0; i < words.length; i += size) out.push(words.slice(i, i + size));
  return out;
}

/** Virtual playhead — drives karaoke captions without a real video file. */
function useVirtualClock(duration: number, playing: boolean) {
  const [time, setTime] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setTime((t) => (t + dt > duration + 0.6 ? 0 : t + dt));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing, duration]);

  return [time, setTime] as const;
}

export function CaptionPreview({
  clip,
  style,
  playing = true,
  className,
}: {
  clip: DemoClip;
  style: CaptionStyle;
  playing?: boolean;
  className?: string;
}) {
  const [time] = useVirtualClock(clip.duration, playing);
  const lines = chunk(clip.captions, style.wordsPerLine);
  const activeLine =
    lines.find((line) => time >= line[0]!.start && time <= line[line.length - 1]!.end) ??
    lines.find((line) => time < line[0]!.start) ??
    lines[lines.length - 1]!;

  const overlay = clip.overlays.find((o) => time >= o.at && time <= o.at + 1.4);
  const OverlayIcon = overlay ? icons[overlay.icon] : null;
  const progress = Math.min(100, (time / clip.duration) * 100);

  // Simulate face tracking movement
  const faceOffset = Math.sin(time * 0.5) * 8;

  return (
    <div
      className={cn(
        "relative aspect-[9/16] w-full overflow-hidden rounded-2xl border border-border bg-primary",
        className,
      )}
    >
      {/* Stand-in for the rendered speaker frame (AI face tracking keeps it centered) */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary to-primary/80" aria-hidden="true" />
      <div className="absolute inset-0 opacity-[0.07] [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:22px_22px]" aria-hidden="true" />
      
      {/* Face tracking visualization */}
      {style.showFaceTracking && (
        <>
          <motion.div
            aria-hidden="true"
            animate={{ 
              scale: [1, 1.04, 1], 
              x: [faceOffset - 6, faceOffset + 6, faceOffset - 6],
              y: [0, 4, 0]
            }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="absolute left-1/2 top-[26%] size-32 -translate-x-1/2 rounded-full bg-accent/25 blur-2xl"
          />
          <motion.div
            className="absolute left-1/2 top-[24%] flex size-24 -translate-x-1/2 items-center justify-center rounded-full border-2 border-dashed border-accent/70"
            animate={{ x: faceOffset }}
            transition={{ type: "spring", stiffness: 100, damping: 20 }}
          >
            <span className="text-[10px] font-semibold uppercase tracking-widest text-accent">
              face lock
            </span>
          </motion.div>
        </>
      )}

      <div className="absolute left-3 top-3 rounded-full bg-background/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider">
        9:16 · 1080p
      </div>

      <AnimatePresence>
        {style.showOverlays && overlay && OverlayIcon && (
          <motion.div
            key={overlay.label}
            initial={{ scale: 0.6, opacity: 0, rotate: -12 }}
            animate={{ scale: 1, opacity: 1, rotate: -6 }}
            exit={{ scale: 0.7, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 18 }}
            className="absolute right-4 top-[38%] flex items-center gap-1.5 rounded-xl bg-background px-2.5 py-1.5 shadow-md"
          >
            <OverlayIcon className="size-4 text-accent" />
            <span className="text-xs font-bold">{overlay.label}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Caption area with effects */}
      <div
        className="absolute inset-x-0 flex flex-wrap justify-center gap-x-2 gap-y-1 px-4 text-center"
        style={{ top: `${style.position}%` }}
      >
        {activeLine.map((w, i) => {
          const state = time > w.end ? "past" : time >= w.start ? "active" : "future";
          const isActive = state === "active";
          const wordText = style.uppercase ? w.word.toUpperCase() : w.word;

          // Jika preset gaya subtitle dipilih, pakai CSS preset-nya (mirror backend ASS)
          const preset = style.preset ? getPreset(style.preset) : null;
          let effectStyles: React.CSSProperties = {};
          let effectClasses = "";

          if (preset) {
            const pc = preset.css;
            effectStyles = {
              fontFamily: pc.fontFamily,
              fontWeight: pc.fontWeight,
              fontStyle: pc.fontStyle,
              color: isActive ? pc.color : "rgba(255,255,255,0.7)",
              backgroundColor: pc.backgroundColor,
              WebkitTextStroke: pc.WebkitTextStroke,
              textShadow: isActive
                ? pc.textShadow
                : pc.textShadow
                ? undefined
                : "0 2px 4px rgba(0,0,0,0.6)",
              borderRadius: pc.borderRadius,
              padding: pc.padding,
              textTransform: pc.textTransform,
              transform: pc.transform,
              letterSpacing: (pc as any).letterSpacing,
            };
          } else {
            // fallback legacy effect logic
            switch (style.effect) {
              case "glow":
                effectStyles = {
                  color: isActive ? style.accent : style.base,
                  WebkitTextStroke: style.stroke
                    ? `2px ${isActive ? style.accent : "rgba(0,0,0,0.85)"}`
                    : undefined,
                  textShadow: isActive
                    ? `0 0 12px ${style.accent}, 0 0 24px ${style.accent}80, 0 3px 0 rgba(0,0,0,0.55)`
                    : style.stroke
                    ? "0 3px 0 rgba(0,0,0,0.55)"
                    : undefined,
                  filter: isActive ? "brightness(1.1)" : undefined,
                };
                break;
              case "box":
                effectStyles = {
                  color: isActive ? "#000000" : style.base,
                  backgroundColor: isActive ? style.accent : "transparent",
                  padding: isActive ? "2px 8px" : "0",
                  borderRadius: isActive ? "4px" : "0",
                  WebkitTextStroke: style.stroke
                    ? `1.5px ${isActive ? style.accent : "rgba(0,0,0,0.85)"}`
                    : undefined,
                  textShadow: !isActive && style.stroke ? "0 3px 0 rgba(0,0,0,0.55)" : undefined,
                };
                break;
              case "pop":
                effectStyles = {
                  color: isActive ? style.accent : style.base,
                  WebkitTextStroke: style.stroke
                    ? `1.5px ${isActive ? style.accent : "rgba(0,0,0,0.85)"}`
                    : undefined,
                  textShadow: style.stroke ? "0 3px 0 rgba(0,0,0,0.55)" : undefined,
                  transform: isActive ? "scale(1.15)" : "scale(1)",
                  transition: "transform 0.15s ease-out",
                };
                break;
              default:
                effectStyles = {
                  color: isActive ? style.accent : style.base,
                  WebkitTextStroke: style.stroke ? "1.5px rgba(0,0,0,0.85)" : undefined,
                  textShadow: style.stroke ? "0 3px 0 rgba(0,0,0,0.55)" : undefined,
                };
            }
          }

          return (
            <motion.span
              key={`${w.word}-${i}`}
              data-state={state}
              className="caption-word"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: `${style.fontSize}px`,
                lineHeight: 1.1,
                transition: "transform 0.15s ease-out",
                ...effectStyles,
              }}
              animate={
                isActive && preset
                  ? preset.animate === "pop"
                    ? { scale: [1, 1.15, 1.05] }
                    : preset.animate === "glow"
                    ? { scale: [1, 1.06, 1] }
                    : { scale: [1, 1.05, 1] }
                  : isActive && style.effect === "pop"
                  ? { scale: [1, 1.15, 1.05] }
                  : undefined
              }
              transition={
                isActive
                  ? { duration: 0.2, ease: "easeOut" }
                  : undefined
              }
            >
              {wordText}
            </motion.span>
          );
        })}
      </div>

      <div className="absolute inset-x-0 bottom-0 h-1 bg-background/30">
        <div className="h-full bg-accent transition-[width]" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
