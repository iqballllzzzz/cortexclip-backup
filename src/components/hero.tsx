"use client";

import { useState, useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowRight,
  Play,
  Pause,
  Sparkles,
  Zap,
  Volume2,
  VolumeX,
  Sliders,
  CheckCircle2,
  Youtube,
  Scissors,
  Layers,
} from "lucide-react";

type SubtitleTheme = {
  id: string;
  name: string;
  font: string;
  wordStyle: string;
  activeWordStyle: string;
  accentColor: string;
  badge: string;
};

const THEMES: SubtitleTheme[] = [
  {
    id: "hormozi",
    name: "Hormozi Gold",
    font: "font-display font-black tracking-tight uppercase",
    wordStyle: "text-white/70",
    activeWordStyle: "text-[#FCD34D] scale-110 drop-shadow-[0_4px_12px_rgba(252,211,77,0.4)]",
    accentColor: "#FCD34D",
    badge: "VIRAL FAVORITE",
  },
  {
    id: "beast",
    name: "MrBeast Punch",
    font: "font-sans font-black tracking-tighter uppercase",
    wordStyle: "text-white/80",
    activeWordStyle: "text-[#38BDF8] scale-115 rotate-[-2deg] drop-shadow-[0_4px_16px_rgba(56,189,248,0.5)]",
    accentColor: "#38BDF8",
    badge: "HIGH RETENTION",
  },
  {
    id: "clean",
    name: "Minimalist Pop",
    font: "font-sans font-semibold tracking-normal",
    wordStyle: "text-white/60",
    activeWordStyle: "text-white bg-white/20 px-2 py-0.5 rounded-md",
    accentColor: "#FFFFFF",
    badge: "PODCAST & ESSAY",
  },
];

const MOCK_WORDS = [
  { text: "KALAU", start: 0, end: 0.4 },
  { text: "LO", start: 0.4, end: 0.7 },
  { text: "MAU", start: 0.7, end: 1.1 },
  { text: "KONSISTEN,", start: 1.1, end: 1.8 },
  { text: "JANGAN", start: 1.8, end: 2.2 },
  { text: "TUNGGU", start: 2.2, end: 2.7 },
  { text: "MOOD", start: 2.7, end: 3.2 },
  { text: "DATANG.", start: 3.2, end: 4.0 },
];

export function Hero() {
  const [activeTheme, setActiveTheme] = useState<SubtitleTheme>(THEMES[0]!);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [faceTrackingActive, setFaceTrackingActive] = useState(true);
  const [youtubeInput, setYoutubeInput] = useState("");
  const [showcaseUrl, setShowcaseUrl] = useState<string | null>(null);

  // Auto-play subtitle preview simulation loop
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setCurrentWordIndex((prev) => (prev + 1) % MOCK_WORDS.length);
    }, 480);
    return () => clearInterval(interval);
  }, [isPlaying]);

  // Fetch real showcase clip if available
  useEffect(() => {
    fetch("/api/showcase")
      .then((r) => (r.ok ? r.json() : { clips: [] }))
      .then((d) => {
        const first = (d.clips ?? []).find((c: { url?: string }) => c.url);
        if (first?.url) setShowcaseUrl(first.url);
      })
      .catch(() => {});
  }, []);

  return (
    <section className="relative pt-12 pb-24 lg:pt-20 lg:pb-32 overflow-hidden bg-background">
      {/* Background Architectural Grid Pattern (Subtle, Anti-Slop) */}
      <div 
        aria-hidden="true" 
        className="pointer-events-none absolute inset-0 opacity-[0.03] dark:opacity-[0.05] [background-image:linear-gradient(to_right,#888_1px,transparent_1px),linear-gradient(to_bottom,#888_1px,transparent_1px)] [background-size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" 
      />

      <div className="relative mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8">
        {/* Top Announcement Tag */}
        <div className="flex justify-center mb-8">
          <Link
            to="/auth"
            className="group inline-flex items-center gap-2.5 rounded-full border border-border/80 bg-surface/70 px-4 py-1.5 text-xs font-medium text-foreground backdrop-blur-sm transition-all hover:border-accent/40 hover:bg-surface"
          >
            <span className="flex size-2 rounded-full bg-accent animate-pulse" />
            <span>AI Auto-Clipper Bahasa Indonesia Pertama</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-accent font-semibold group-hover:translate-x-0.5 transition-transform inline-flex items-center gap-1">
              Coba Gratis <ArrowRight className="size-3" />
            </span>
          </Link>
        </div>

        {/* Main Hero Header */}
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="font-display text-[42px] sm:text-[68px] lg:text-[76px] font-extrabold tracking-[-0.035em] leading-[1.04] text-foreground">
            Satu Video Panjang, <br />
            <span className="relative inline-block">
              <span className="relative z-10 text-accent">Puluhan Klip Viral</span>
              {/* Refined underline accent line */}
              <motion.span
                layoutId="hero-underline"
                className="absolute left-0 bottom-1.5 h-[5px] w-full bg-accent/20 rounded-full -z-0"
              />
            </span>
          </h1>

          <p className="mt-6 mx-auto max-w-2xl text-base sm:text-lg leading-relaxed text-muted-foreground font-sans">
            Ubah podcast, webinar, atau ceramah YouTube jadi format vertikal 9:16 dalam hitungan menit. Lengkap dengan subtitle karaoke otomatis, deteksi pembicara, dan virality score teruji.
          </p>

          {/* Action Area: Fast URL Input or Start Button */}
          <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3 max-w-lg mx-auto">
            <Link
              to="/auth"
              className="w-full sm:w-auto h-13 px-8 rounded-xl bg-accent text-accent-foreground font-semibold text-sm flex items-center justify-center gap-2.5 shadow-lg shadow-accent/20 hover:brightness-105 active:scale-[0.98] transition-all"
            >
              <Zap className="size-4 fill-current" />
              Mulai Buat Klip Sekarang
            </Link>
            <a
              href="#demo-interactive"
              className="w-full sm:w-auto h-13 px-6 rounded-xl border border-border bg-card text-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:bg-surface active:scale-[0.98] transition-all"
            >
              Lihat Studio Interaktif
            </a>
          </div>

          <div className="mt-5 flex items-center justify-center gap-6 text-xs text-muted-foreground/80 font-medium">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5 text-accent" /> Tanpa Kartu Kredit
            </span>
            <span>•</span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5 text-accent" /> Ekspor 1080p Full HD
            </span>
            <span>•</span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5 text-accent" /> Akses Gratis via Iklan
            </span>
          </div>
        </div>

        {/* ═══ INTERACTIVE STUDIO STAGE (The OpusClip-killer feature demo) ═══ */}
        <div id="demo-interactive" className="mt-16 sm:mt-20">
          <div className="relative mx-auto max-w-5xl rounded-3xl border border-border bg-card/60 p-3 sm:p-5 shadow-2xl backdrop-blur-md">
            {/* Top Studio Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/80 pb-4 px-2">
              <div className="flex items-center gap-3">
                <span className="flex gap-1.5">
                  <span className="size-3 rounded-full bg-red-500/80" />
                  <span className="size-3 rounded-full bg-amber-500/80" />
                  <span className="size-3 rounded-full bg-emerald-500/80" />
                </span>
                <span className="text-xs font-mono font-medium text-muted-foreground">
                  STUDIO PREVIEW · 1080x1920 (9:16)
                </span>
              </div>

              {/* Controls inside studio header */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFaceTrackingActive(!faceTrackingActive)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                    faceTrackingActive
                      ? "bg-accent/15 text-accent border border-accent/30"
                      : "bg-surface text-muted-foreground border border-border"
                  }`}
                  title="Toggle Face-Tracking Reframe"
                >
                  <Scissors className="size-3" />
                  <span>Face-Tracking: {faceTrackingActive ? "ON" : "OFF"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-surface text-foreground hover:bg-card transition-colors"
                >
                  {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5 translate-x-0.5" />}
                </button>
              </div>
            </div>

            {/* Studio Workspace: Canvas + Live Parameter Sidebar */}
            <div className="grid lg:grid-cols-[1fr_340px] gap-6 items-center pt-5">
              {/* Left/Center: Simulated Vertical Video Phone Wireframe */}
              <div className="relative flex justify-center py-4 sm:py-6 bg-surface/30 rounded-2xl border border-border/50 overflow-hidden">
                <div className="relative w-[270px] sm:w-[310px] aspect-[9/16] rounded-[2.25rem] border-[6px] border-neutral-900 bg-neutral-950 overflow-hidden shadow-2xl flex flex-col justify-between p-4">
                  {/* Speaker Video Simulation / Real Video */}
                  <div className="absolute inset-0 z-0 overflow-hidden">
                    {showcaseUrl ? (
                      <video
                        src={showcaseUrl}
                        className="size-full object-cover opacity-80"
                        playsInline
                        muted
                        loop
                        autoPlay
                      />
                    ) : (
                      /* High-craft simulated speaker video background */
                      <div className="size-full bg-gradient-to-b from-neutral-800 via-neutral-900 to-black relative flex items-center justify-center">
                        <div
                          className={`size-32 rounded-full bg-neutral-700/60 border border-neutral-600 transition-all duration-700 ${
                            faceTrackingActive ? "scale-105 translate-y-[-10%]" : "translate-x-[-25%]"
                          }`}
                        >
                          <div className="size-full flex items-center justify-center text-xs font-mono text-neutral-400">
                            [Speaker]
                          </div>
                        </div>

                        {/* Face Tracking Bounding Box */}
                        {faceTrackingActive && (
                          <motion.div
                            layout
                            className="absolute size-40 rounded-2xl border-2 border-accent/80 border-dashed pointer-events-none flex flex-col justify-between p-1.5"
                          >
                            <span className="text-[9px] font-mono font-bold uppercase bg-accent text-accent-foreground px-1 py-0.5 rounded self-start">
                              AI TRACK: 98%
                            </span>
                            <span className="size-2 rounded-full bg-accent self-end animate-ping" />
                          </motion.div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Top Phone Overlay (Score Badge) */}
                  <div className="relative z-10 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-md border border-white/10">
                      <Sparkles className="size-3 text-accent" /> VIRAL SCORE: 96
                    </span>
                    <span className="font-mono text-[10px] text-white/70 bg-black/50 px-2 py-0.5 rounded">
                      00:24
                    </span>
                  </div>

                  {/* Subtitle Karaoke Display Area */}
                  <div className="relative z-10 pb-8 text-center px-2">
                    <div className={`${activeTheme.font} text-xl sm:text-2xl leading-snug flex flex-wrap justify-center gap-x-1.5 gap-y-1`}>
                      {MOCK_WORDS.map((w, idx) => {
                        const isCurrent = idx === currentWordIndex;
                        return (
                          <span
                            key={w.text}
                            className={`transition-all duration-200 ${
                              isCurrent ? activeTheme.activeWordStyle : activeTheme.wordStyle
                            }`}
                          >
                            {w.text}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Bottom Minimal Watermark */}
                  <div className="relative z-10 flex justify-center">
                    <span className="text-[10px] font-sans font-medium text-white/40 tracking-wider">
                      CortexClip AI
                    </span>
                  </div>
                </div>
              </div>

              {/* Right: Live Interactive Theme & Control Switcher */}
              <div className="space-y-4 px-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-accent flex items-center gap-1.5">
                    <Sliders className="size-3.5" /> Interactive Playground
                  </p>
                  <h3 className="text-xl font-display font-bold text-foreground mt-1">
                    Ganti Gaya Subtitle Langsung
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Pilih preset karaoke di bawah untuk melihat animasi teks berubah seketika di canvas 9:16.
                  </p>
                </div>

                {/* Subtitle Theme Selectors */}
                <div className="space-y-2.5">
                  {THEMES.map((theme) => {
                    const isSelected = activeTheme.id === theme.id;
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => setActiveTheme(theme)}
                        className={`w-full text-left p-3.5 rounded-2xl border transition-all flex items-center justify-between ${
                          isSelected
                            ? "border-accent bg-accent/10 shadow-sm"
                            : "border-border bg-card/80 hover:border-accent/40 hover:bg-surface"
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-display text-sm font-bold text-foreground">
                              {theme.name}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface border border-border text-muted-foreground font-semibold">
                              {theme.badge}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Animasi presisi per kata · Auto-highlight
                          </p>
                        </div>

                        <span
                          className="size-4 rounded-full border-2 flex items-center justify-center shrink-0"
                          style={{ borderColor: isSelected ? theme.accentColor : "currentColor" }}
                        >
                          {isSelected && (
                            <span
                              className="size-2 rounded-full"
                              style={{ backgroundColor: theme.accentColor }}
                            />
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Micro Metric Callout */}
                <div className="rounded-2xl border border-border bg-surface/50 p-4 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">AI Hook Score</span>
                    <span className="font-bold font-mono text-accent">98 / 100</span>
                  </div>
                  <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
                    <div className="h-full bg-accent w-[98%]" />
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-tight pt-1">
                    AI memotong momen dengan emosi puncak dan hook tertinggi agar video tidak di-skip.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
