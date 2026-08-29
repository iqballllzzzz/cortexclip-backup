import { useRef, useState, useEffect } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * 8 GAYA SUBTITLE — satu sumber kebenaran di frontend.
 * Nilai-nilai ini MIRROR STYLE_PRESETS di backend `subtitles.py`
 * supaya preview browser == hasil render MP4 (libass burn).
 *
 * Setiap gaya punya: nama, font, warna aktif, warna dasar, outline,
 * bentuk/animasi khas — ditampilkan lewat kartu preview animasi "Halo".
 */

export interface SubtitlePreset {
  id: string;
  label: string;
  /** dikirim ke backend build_ass */
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
  /** representasi CSS untuk live preview browser (mirror ASS tags) */
  css: {
    fontFamily: string;
    fontWeight?: string;
    fontStyle?: string;
    color: string;
    backgroundColor?: string;
    WebkitTextStroke?: string;
    textShadow?: string;
    transform?: string;
    borderRadius?: string;
    padding?: string;
    textTransform?: "uppercase" | "none";
  };
  /** animasi kata aktif (mirror \k + effect_tags) */
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
      fontFamily: "'Montserrat', sans-serif", fontWeight: "800",
      color: "#FFFFFF", WebkitTextStroke: "2px rgba(0,0,0,0.9)",
      textTransform: "uppercase",
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
      fontFamily: "'Anton', sans-serif", fontWeight: "400",
      color: "#FFFFFF", WebkitTextStroke: "2px rgba(0,0,0,0.9)",
      textTransform: "uppercase",
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
      fontFamily: "'Montserrat', sans-serif", fontWeight: "800",
      color: "#FFFFFF",
      textShadow:
        "0 0 8px #FF2E88, 0 0 20px #FF2E88, 0 0 32px #FF2E88, 0 3px 0 rgba(0,0,0,0.55)",
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
      fontFamily: "'Inter', sans-serif", fontWeight: "500",
      color: "#FFFFFF",
      textShadow: "0 2px 6px rgba(0,0,0,0.6)",
    },
    animate: "none",
  },
  {
    id: "comic-bang",
    label: "Comic Bang",
    style: {
      accent: "#FFE600", base: "#FFE600", outline: "#FF2200",
      fontSize: 54, fontName: "Impact", wordsPerLine: 2,
      position: 50, stroke: true, bold: true, uppercase: true,
      effect: "pop", opacity: 0.6,
    },
    css: {
      fontFamily: "'Impact', 'Arial Black', sans-serif", fontWeight: "900",
      color: "#FFE600",
      WebkitTextStroke: "3px #FF2200",
      textTransform: "uppercase",
      transform: "rotate(-3deg)",
    },
    animate: "pop",
  },
  {
    id: "sermon-elegant",
    label: "Sermon Elegan",
    style: {
      accent: "#D4AF37", base: "#F8F4E8", outline: "#2A2A2A",
      fontSize: 38, fontName: "NotoSerif", wordsPerLine: 3,
      position: 64, stroke: true, bold: false, uppercase: false,
      effect: "classic", opacity: 0.5,
    },
    css: {
      fontFamily: "'Noto Serif', serif", fontWeight: "400", fontStyle: "italic",
      color: "#F8F4E8",
      textShadow: "0 0 10px rgba(212,175,55,0.6), 0 2px 4px rgba(0,0,0,0.7)",
      letterSpacing: "0.04em",
    },
    animate: "slide",
  },
  {
    id: "typewriter",
    label: "Typewriter",
    style: {
      accent: "#4AF626", base: "#D8FFD0", outline: "#0A3300",
      fontSize: 36, fontName: "Courier New", wordsPerLine: 4,
      position: 78, stroke: true, bold: false, uppercase: false,
      effect: "box", opacity: 0.5,
    },
    css: {
      fontFamily: "'Courier New', monospace", fontWeight: "400",
      color: "#D8FFD0",
      backgroundColor: "rgba(10,51,0,0.85)",
      padding: "4px 10px",
      borderRadius: "2px",
      WebkitTextStroke: "1px #0A3300",
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
      fontFamily: "'Anton', sans-serif", fontWeight: "400",
      color: "#FFFFFF", WebkitTextStroke: "2px rgba(90,0,255,0.9)",
      textShadow: "0 0 10px #7CFC00, 0 0 24px #7CFC00",
      textTransform: "uppercase",
    },
    animate: "glow",
  },
];

export const DEFAULT_SUBTITLE_PRESET = "hormozi";

/** Ambil preset via id, default fallback hormozi. */
export function getPreset(id: string): SubtitlePreset {
  return SUBTITLE_PRESETS.find((p) => p.id === id) ?? SUBTITLE_PRESETS[0]!;
}

/** Satu kartu preview animasi "Halo" untuk satu gaya. */
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
      className={cn(
        "group relative flex flex-col items-center justify-center overflow-hidden rounded-xl border p-3 transition-all",
        active
          ? "border-accent bg-accent/10 ring-1 ring-accent/40"
          : "border-border bg-card hover:border-accent/40",
      )}
    >
      {/* mini stage 9:16-ish */}
      <div className="relative flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-lg bg-black/40">
        {/* subtle grid bg */}
        <div className="absolute inset-0 opacity-[0.05] [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:14px_14px]" />
        <AnimatedHalo preset={preset} className="px-2 text-center" />
      </div>
      <span
        className={cn(
          "mt-2 w-full rounded-md border px-2 py-1 text-center text-[11px] font-medium",
          active
            ? "border-accent/50 text-accent"
            : "border-border text-muted-foreground group-hover:text-foreground",
        )}
      >
        {preset.label}
      </span>
    </button>
  );
}

/** Kata "Halo" yang dianimasikan sesuai gaya. */
function AnimatedHalo({ preset, className }: { preset: SubtitlePreset; className?: string }) {
  const baseStyle: React.CSSProperties = {
    fontFamily: preset.css.fontFamily,
    fontWeight: preset.css.fontWeight,
    fontStyle: preset.css.fontStyle,
    color: preset.css.color,
    backgroundColor: preset.css.backgroundColor,
    WebkitTextStroke: preset.css.WebkitTextStroke,
    textShadow: preset.css.textShadow,
    borderRadius: preset.css.borderRadius,
    padding: preset.css.padding,
    textTransform: preset.css.textTransform,
    transform: preset.css.transform,
    letterSpacing: (preset.css as any).letterSpacing,
    fontSize: "clamp(22px, 5vw, 40px)",
    lineHeight: 1.15,
    display: "inline-block",
  };

  const isWord = preset.id === "typewriter";

  return (
    <div className={cn("relative", className)}>
      <motion.span
        style={baseStyle}
        animate={animationFor(preset)}
        transition={
          preset.animate === "type"
            ? { duration: 1.4, ease: "linear", repeat: Infinity }
            : { duration: 0.7, ease: "easeOut", repeat: Infinity, repeatType: "reverse" }
        }
      >
        {isWord ? "Halo" : "HALO"}
      </motion.span>
    </div>
  );
}

function animationFor(preset: SubtitlePreset) {
  switch (preset.animate) {
    case "pop":
      return { scale: [1, 1.18, 1.06, 1], rotate: preset.id === "comic-bang" ? [-3, -7, 0, -3] : 0 };
    case "glow":
      return { textShadow: [
          "0 0 8px " + preset.style.accent + ", 0 0 16px " + preset.style.accent,
          "0 0 20px " + preset.style.accent + ", 0 0 40px " + preset.style.accent,
          "0 0 8px " + preset.style.accent + ", 0 0 16px " + preset.style.accent,
        ] };
    case "type":
      return { opacity: [0, 1], scale: [0.97, 1] };
    case "slide":
      return { x: [-6, 6, -6], opacity: [0.5, 1, 0.5] };
    default:
      return { scale: [1, 1.04, 1] };
  }
}

/**
 * Kartu-pilihan besar semua gaya subtitle — grid responsif.
 * Dipakai di editor terpadu (halaman proyek).
 */
export function SubtitleStylePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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

/** Simpan pointer untuk re-render (digunakan kalau perlu). */
export const useSubtitleLoop = () => {
  const [tick, setTick] = useState(0);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    const start = performance.now();
    const loop = (now: number) => {
      setTick(now - start);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, []);
  return tick;
};
