import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * 8 GAYA SUBTITLE — mirror STYLE_PRESETS backend `subtitles.py`.
 * Font CSS == font yang ter-install di VPS (dibakar libass ke MP4),
 * jadi preview kartu == hasil render: Archivo Black, Courier Prime,
 * Noto Serif, Montserrat, Anton, Inter.
 *
 * Kartu SENGAJA kecil ("Halo" mini + nama) supaya 8 gaya muat
 * dalam SATU layar tanpa scroll.
 */

export interface SubtitlePreset {
  id: string;
  label: string;
  style: {
    accent: string;
    base: string;
    outline: string;
    fontSize: number;
    fontName: string;
    wordsPerLine: number;
    position: number;
    stroke: boolean;
    bold: boolean;
    uppercase: boolean;
    italic?: boolean;
    effect: "classic" | "glow" | "pop" | "box";
    opacity: number;
  };
  css: React.CSSProperties;
  animate: "none" | "pop" | "glow" | "box" | "type" | "slide";
}

export const SUBTITLE_PRESETS: SubtitlePreset[] = [
  {
    id: "hormozi",
    label: "Hormozi",
    style: {
      accent: "#FFD400", base: "#FFFFFF", outline: "#000000",
      fontSize: 44, fontName: "Montserrat", wordsPerLine: 2,
      position: 68, stroke: true, bold: true, uppercase: true,
      effect: "pop", opacity: 0.55,
    },
    css: {
      fontFamily: "'Montserrat', sans-serif", fontWeight: 800,
      color: "#FFD400", WebkitTextStroke: "1px rgba(0,0,0,0.9)",
      textTransform: "uppercase", letterSpacing: "-0.02em",
    },
    animate: "pop",
  },
  {
    id: "tiktok-pop",
    label: "TikTok Pop",
    style: {
      accent: "#00F0FF", base: "#FFFFFF", outline: "#000000",
      fontSize: 52, fontName: "Anton", wordsPerLine: 2,
      position: 58, stroke: true, bold: true, uppercase: true,
      effect: "pop", opacity: 0.5,
    },
    css: {
      fontFamily: "'Anton', sans-serif", fontWeight: 400,
      color: "#00F0FF", WebkitTextStroke: "1px rgba(0,0,0,0.9)",
      textTransform: "uppercase", letterSpacing: "0.01em",
    },
    animate: "pop",
  },
  {
    id: "neon-glow",
    label: "Neon Glow",
    style: {
      accent: "#FF2E88", base: "#FFFFFF", outline: "#000000",
      fontSize: 40, fontName: "Montserrat", wordsPerLine: 3,
      position: 60, stroke: true, bold: true, uppercase: false,
      effect: "glow", opacity: 0.4,
    },
    css: {
      fontFamily: "'Montserrat', sans-serif", fontWeight: 700,
      color: "#FFFFFF",
      textShadow: "0 0 6px #FF2E88, 0 0 14px #FF2E88",
    },
    animate: "glow",
  },
  {
    id: "clean-minimal",
    label: "Clean Minimal",
    style: {
      accent: "#F5F5F5", base: "#FFFFFF", outline: "#111111",
      fontSize: 34, fontName: "Inter", wordsPerLine: 4,
      position: 74, stroke: false, bold: false, uppercase: false,
      effect: "classic", opacity: 0.62,
    },
    css: {
      fontFamily: "'Inter', sans-serif", fontWeight: 500,
      color: "#FFFFFF", textShadow: "0 1px 4px rgba(0,0,0,0.6)",
    },
    animate: "none",
  },
  {
    id: "comic-bang",
    label: "Comic Bang",
    style: {
      accent: "#FFE600", base: "#FFE600", outline: "#FF2200",
      fontSize: 54, fontName: "Archivo Black", wordsPerLine: 2,
      position: 50, stroke: true, bold: true, uppercase: true,
      effect: "pop", opacity: 0.6,
    },
    css: {
      fontFamily: "'Archivo Black', sans-serif", fontWeight: 400,
      color: "#FFE600", WebkitTextStroke: "1.5px #FF2200",
      textTransform: "uppercase", transform: "rotate(-4deg)",
    },
    animate: "pop",
  },
  {
    id: "sermon-elegant",
    label: "Sermon Elegan",
    style: {
      accent: "#D4AF37", base: "#F8F4E8", outline: "#2A2A2A",
      fontSize: 38, fontName: "Noto Serif", wordsPerLine: 3,
      position: 64, stroke: true, bold: false, uppercase: false,
      effect: "classic", opacity: 0.5,
    },
    css: {
      fontFamily: "'Noto Serif', serif", fontWeight: 400,
      fontStyle: "italic", color: "#D4AF37",
      textShadow: "0 1px 3px rgba(0,0,0,0.8)", letterSpacing: "0.05em",
    },
    animate: "slide",
  },
  {
    id: "typewriter",
    label: "Typewriter",
    style: {
      accent: "#4AF626", base: "#D8FFD0", outline: "#0A3300",
      fontSize: 36, fontName: "Courier Prime", wordsPerLine: 4,
      position: 78, stroke: true, bold: false, uppercase: false,
      effect: "box", opacity: 0.5,
    },
    css: {
      fontFamily: "'Courier Prime', monospace", fontWeight: 400,
      color: "#4AF626", backgroundColor: "rgba(10,51,0,0.85)",
      padding: "2px 6px", borderRadius: 2,
    },
    animate: "type",
  },
  {
    id: "gaming-energy",
    label: "Gaming Energy",
    style: {
      accent: "#7CFC00", base: "#FFFFFF", outline: "#5A00FF",
      fontSize: 50, fontName: "Anton", wordsPerLine: 2,
      position: 70, stroke: true, bold: true, uppercase: true,
      effect: "glow", opacity: 0.55,
    },
    css: {
      fontFamily: "'Anton', sans-serif", fontWeight: 400,
      color: "#7CFC00", WebkitTextStroke: "1px rgba(90,0,255,0.95)",
      textShadow: "0 0 8px #7CFC00, 0 0 18px #5A00FF",
      textTransform: "uppercase", transform: "skewX(-6deg)",
    },
    animate: "glow",
  },
];

export const DEFAULT_SUBTITLE_PRESET = "hormozi";

/** Ambil preset via id, default fallback hormozi. */
export function getPreset(id: string): SubtitlePreset {
  return SUBTITLE_PRESETS.find((p) => p.id === id) ?? SUBTITLE_PRESETS[0]!;
}

/** Animasi khas per gaya untuk kata "Halo" mini. */
function haloAnimation(preset: SubtitlePreset) {
  switch (preset.animate) {
    case "pop":
      return {
        scale: [1, 1.22, 1.05, 1],
        rotate: preset.id === "comic-bang" ? [-4, -8, 0, -4] : 0,
      };
    case "glow":
      return {
        textShadow: [
          `0 0 5px ${preset.style.accent}, 0 0 10px ${preset.style.accent}`,
          `0 0 12px ${preset.style.accent}, 0 0 26px ${preset.style.accent}`,
          `0 0 5px ${preset.style.accent}, 0 0 10px ${preset.style.accent}`,
        ],
        scale: [1, 1.06, 1],
      };
    case "type":
      return { opacity: [0, 1], x: [-1, 0] };
    case "slide":
      return { y: [0, -2.5, 0], opacity: [0.55, 1, 0.55] };
    default:
      return { opacity: [0.75, 1, 0.75] };
  }
}

/** Kartu mini: "Halo" beranimasi + nama gaya — kecil supaya 8 muat 1 layar. */
export function SubtitleStyleCard({
  preset,
  active,
  onClick,
}: {
  preset: SubtitlePreset;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={preset.label}
      className={cn(
        "group flex w-full flex-col items-center gap-1 rounded-lg border p-1.5 transition-colors",
        active
          ? "border-accent/70 bg-accent/10"
          : "border-border bg-card hover:border-accent/40",
      )}
    >
      {/* mini stage — "Halo" kecil beranimasi */}
      <div className="flex h-11 w-full items-center justify-center overflow-hidden rounded-md bg-black/45">
        <motion.span
          style={{ ...(preset.css as any), fontSize: 13, lineHeight: 1.1, display: "inline-block" } as any}
          animate={haloAnimation(preset)}
          transition={
            preset.animate === "type"
              ? { duration: 1.3, ease: "linear", repeat: Infinity }
              : { duration: 0.75, ease: "easeOut", repeat: Infinity, repeatType: "reverse" }
          }
        >
          {preset.style.uppercase ? "HALO" : "Halo"}
        </motion.span>
      </div>
      <span
        className={cn(
          "w-full truncate text-center text-[9.5px] font-medium leading-none",
          active ? "text-accent" : "text-muted-foreground group-hover:text-foreground",
        )}
      >
        {preset.label}
      </span>
    </button>
  );
}

/**
 * Baris pilihan 8 gaya subtitle — KOMPAK, satu layar tanpa scroll.
 * 8 kolom di desktop, 4 kolom (2 baris) di layar kecil.
 */
export function SubtitleStylePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
      {SUBTITLE_PRESETS.map((p) => (
        <SubtitleStyleCard
          key={p.id}
          preset={p}
          active={value === p.id}
          onClick={() => onChange(p.id)}
        />
      ))}
    </div>
  );
}
