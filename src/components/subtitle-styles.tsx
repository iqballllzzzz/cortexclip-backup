import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * PRESET SUBTITLE — mirror CAPTION_TEMPLATES backend (port Supoclip).
 * Font CSS == font bundle VPS app/fonts (THE BOLD FONT, TikTok Sans,
 * Bangers, Bebas Neue, Poppins ExtraBold, Anton, Oswald...).
 * Template key Supoclip: word_box (pill kata aktif), emoji, emphasis,
 * animation karaoke/pop/bounce/fade.
 */

export interface SubtitlePreset {
  id: string;
  label: string;
  style: {
    preset: string;
    font_family: string;
    font_size: number;
    font_color: string;
    highlight_color: string;
    position: number; // % dari atas
    word_box?: boolean;
    word_box_color?: string;
    emoji?: boolean;
    uppercase?: boolean;
  };
  css: React.CSSProperties;
  animate: "none" | "pop" | "glow" | "box" | "type" | "slide";
}

export const SUBTITLE_PRESETS: SubtitlePreset[] = [
  {
    id: "default",
    label: "Default",
    style: {
      preset: "default", font_family: "THE BOLD FONT", font_size: 32,
      font_color: "#FFFFFF", highlight_color: "#FFE000",
      position: 80, emoji: true,
    },
    css: {
      fontFamily: "'THE BOLD FONT', 'Anton', sans-serif",
      color: "#FFE000", WebkitTextStroke: "1.5px rgba(0,0,0,0.9)",
    },
    animate: "pop",
  },
  {
    id: "hormozi",
    label: "Hormozi",
    style: {
      preset: "hormozi", font_family: "THE BOLD FONT", font_size: 38,
      font_color: "#FFFFFF", highlight_color: "#00FF66",
      position: 74, word_box: true, word_box_color: "#00BF49",
      emoji: true, uppercase: true,
    },
    css: {
      fontFamily: "'THE BOLD FONT', 'Anton', sans-serif",
      color: "#FFFFFF", WebkitTextStroke: "1.5px rgba(0,0,0,0.9)",
      textTransform: "uppercase",
    },
    animate: "pop",
  },
  {
    id: "mrbeast",
    label: "MrBeast",
    style: {
      preset: "mrbeast", font_family: "THE BOLD FONT", font_size: 42,
      font_color: "#FFFF00", highlight_color: "#FF2D2D",
      position: 70, emoji: true, uppercase: true,
    },
    css: {
      fontFamily: "'THE BOLD FONT', 'Anton', sans-serif",
      color: "#FFFF00", WebkitTextStroke: "1.5px rgba(0,0,0,0.9)",
      textTransform: "uppercase",
    },
    animate: "pop",
  },
  {
    id: "tiktok",
    label: "TikTok Pop",
    style: {
      preset: "tiktok", font_family: "TikTok Sans", font_size: 34,
      font_color: "#FFFFFF", highlight_color: "#FE2C55",
      position: 78, emoji: true,
    },
    css: {
      fontFamily: "'TikTok Sans', sans-serif", fontWeight: 700,
      color: "#FE2C55", WebkitTextStroke: "1.5px rgba(0,0,0,0.9)",
    },
    animate: "pop",
  },
  {
    id: "neon",
    label: "Neon Glow",
    style: {
      preset: "neon", font_family: "THE BOLD FONT", font_size: 36,
      font_color: "#00FFFF", highlight_color: "#FF00FF",
      position: 76,
    },
    css: {
      fontFamily: "'THE BOLD FONT', 'Anton', sans-serif",
      color: "#00FFFF",
      textShadow: "0 0 6px #FF00FF, 0 0 14px #00FFFF",
    },
    animate: "glow",
  },
  {
    id: "minimal",
    label: "Clean Minimal",
    style: {
      preset: "minimal", font_family: "TikTok Sans", font_size: 26,
      font_color: "#FFFFFF", highlight_color: "#FFFFFF",
      position: 82, uppercase: false,
    },
    css: {
      fontFamily: "'TikTok Sans', sans-serif", fontWeight: 500,
      color: "#FFFFFF", backgroundColor: "rgba(0,0,0,0.5)",
      padding: "2px 8px", borderRadius: 4,
    },
    animate: "none",
  },
  {
    id: "comic",
    label: "Comic Bang",
    style: {
      preset: "comic", font_family: "Bangers", font_size: 40,
      font_color: "#FFE600", highlight_color: "#FF2200",
      position: 70, emoji: true, uppercase: true,
    },
    css: {
      fontFamily: "'Bangers', cursive",
      color: "#FFE600", WebkitTextStroke: "1.5px #FF2200",
      textTransform: "uppercase", letterSpacing: "0.03em",
    },
    animate: "pop",
  },
  {
    id: "podcast",
    label: "Sermon Elegan",
    style: {
      preset: "podcast", font_family: "TikTok Sans", font_size: 28,
      font_color: "#FFFFFF", highlight_color: "#FFB800",
      position: 80,
    },
    css: {
      fontFamily: "'TikTok Sans', sans-serif", fontWeight: 500,
      color: "#FFB800", backgroundColor: "rgba(26,26,26,0.8)",
      padding: "2px 8px", borderRadius: 4,
    },
    animate: "slide",
  },
  {
    id: "typewriter",
    label: "Typewriter",
    style: {
      preset: "typewriter", font_family: "Courier Prime", font_size: 30,
      font_color: "#D8FFD0", highlight_color: "#4AF626",
      position: 78, word_box: true, word_box_color: "#0A3300",
    },
    css: {
      fontFamily: "'Courier Prime', monospace",
      color: "#4AF626", backgroundColor: "rgba(10,51,0,0.85)",
      padding: "2px 6px", borderRadius: 2,
    },
    animate: "type",
  },
  {
    id: "gaming",
    label: "Gaming Energy",
    style: {
      preset: "gaming", font_family: "Anton", font_size: 38,
      font_color: "#FFFFFF", highlight_color: "#7CFC00",
      position: 72, emoji: true, uppercase: true,
    },
    css: {
      fontFamily: "'Anton', sans-serif",
      color: "#7CFC00", WebkitTextStroke: "1px rgba(90,0,255,0.95)",
      textShadow: "0 0 8px #7CFC00, 0 0 18px #5A00FF",
      textTransform: "uppercase", transform: "skewX(-4deg)",
    },
    animate: "glow",
  },
];

export const DEFAULT_SUBTITLE_PRESET = "hormozi";

/** Ambil preset via id, default fallback hormozi. */
export function getPreset(id: string): SubtitlePreset {
  return SUBTITLE_PRESETS.find((p) => p.id === id) ?? SUBTITLE_PRESETS[1]!;
}

/** Animasi khas per gaya untuk kata "Halo" mini. */
function haloAnimation(preset: SubtitlePreset) {
  switch (preset.animate) {
    case "pop":
      return { scale: [1, 1.15, 1], opacity: [0.85, 1, 0.85] };
    case "glow":
      return {
        textShadow: [
          `0 0 5px ${preset.style.highlight_color}, 0 0 10px ${preset.style.highlight_color}`,
          `0 0 12px ${preset.style.highlight_color}, 0 0 26px ${preset.style.highlight_color}`,
          `0 0 5px ${preset.style.highlight_color}, 0 0 10px ${preset.style.highlight_color}`,
        ],
      };
    case "type":
      return { opacity: [0, 1], x: [-1, 0] };
    case "slide":
      return { y: [0, -2.5, 0], opacity: [0.55, 1, 0.55] };
    default:
      return { opacity: [0.75, 1, 0.75] };
  }
}

/** Kartu mini: "Halo" beranimasi + nama gaya — kecil supaya semua muat 1 layar. */
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

/** Baris pilihan gaya subtitle — KOMPAK, satu layar tanpa scroll. */
export function SubtitleStylePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
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
