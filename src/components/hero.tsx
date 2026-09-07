"use client";

import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Play,
  Pause,
  Scissors,
  CheckCircle2,
  Zap,
  Sliders,
  Sparkles,
} from "lucide-react";

type SubtitleTheme = {
  id: string;
  name: string;
  badge: string;
  font: string;
  wordStyle: string;
  activeWordStyle: string;
  accentColor: string;
};

const THEMES: SubtitleTheme[] = [
  {
    id: "hormozi",
    name: "Hormozi Gold",
    badge: "VIRAL FAVORITE",
    font: "font-display uppercase tracking-wide",
    wordStyle: "text-white/90 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]",
    activeWordStyle: "text-amber-400 scale-110 drop-shadow-[0_2px_8px_rgba(245,158,11,0.9)] font-extrabold",
    accentColor: "#f59e0b",
  },
  {
    id: "mrbeast",
    name: "MrBeast Punch",
    badge: "HIGH RETENTION",
    font: "font-display font-black tracking-tight uppercase",
    wordStyle: "text-white drop-shadow-[0_3px_6px_rgba(0,0,0,0.9)]",
    activeWordStyle: "text-yellow-300 scale-115 rotate-[-2deg] font-black drop-shadow-[0_4px_12px_rgba(0,0,0,1)]",
    accentColor: "#eab308",
  },
  {
    id: "minimal",
    name: "Clean Editorial",
    badge: "PODCAST & ESSAY",
    font: "font-sans font-semibold tracking-normal",
    wordStyle: "text-white/70",
    activeWordStyle: "text-white bg-white/20 px-2 py-0.5 rounded font-bold",
    accentColor: "#ffffff",
  },
];

const MOCK_WORDS = [
  { text: "INI", duration: 0.4 },
  { text: "RAHASIA", duration: 0.5 },
  { text: "ALGORITMA", duration: 0.6 },
  { text: "TIKTOK", duration: 0.4 },
  { text: "DI", duration: 0.3 },
  { text: "TAHUN", duration: 0.4 },
  { text: "2026", duration: 0.5 },
];

export function Hero() {
  const [activeTheme, setActiveTheme] = useState<SubtitleTheme>(THEMES[0]!);
  const [isPlaying, setIsPlaying] = useState(true);
  const [faceTrackingActive, setFaceTrackingActive] = useState(true);
  const [currentWordIndex, setCurrentWordIndex] = useState(2);
  const [showcaseUrl, setShowcaseUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setCurrentWordIndex((prev) => (prev + 1) % MOCK_WORDS.length);
    }, 480);
    return () => clearInterval(interval);
  }, [isPlaying]);

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
    <section className="relative pt-12 pb-20 lg:pt-20 lg:pb-28 overflow-hidden bg-background">
      <div 
        aria-hidden="true" 
        className="pointer-events-none absolute inset-0 opacity-[0.03] dark:opacity-[0.05] [background-image:linear-gradient(to_right,#888_1px,transparent_1px),linear-gradient(to_bottom,#888_1px,transparent_1px)] [background-size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" 
      />

      <div className="relative mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-xs font-medium text-foreground">
            <span className="size-2 rounded-full bg-accent" />
            <span>AI Auto-Clipper Bahasa Indonesia Pertama</span>
            <span className="text-muted-foreground">·</span>
            <Link to="/auth" className="text-accent font-semibold inline-flex items-center gap-1 hover:underline">
              Coba Gratis <ArrowRight className="size-3" />
            </Link>
          </div>

          <h1 className="font-display text-[42px] sm:text-[68px] lg:text-[76px] font-extrabold tracking-[-0.035em] leading-[1.04] text-foreground">
            Satu Video Panjang, <br />
            <span className="text-accent">Puluhan Klip Viral</span>
          </h1>

          <p className="mt-6 mx-auto max-w-[55ch] text-base sm:text-lg leading-relaxed text-muted-foreground font-sans">
            Ubah podcast, webinar, atau ceramah YouTube jadi format vertikal 9:16 dalam hitungan menit. Lengkap dengan subtitle karaoke otomatis, deteksi pembicara, dan virality score teruji.
          </p>

          <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3 max-w-lg mx-auto">
            <Link
              to="/auth"
              className="w-full sm:w-auto py-3.5 px-8 rounded-xl bg-accent text-accent-foreground font-semibold text-sm flex items-center justify-center gap-2.5 transition-colors hover:opacity-90 active:scale-[0.98]"
            >
              <Zap className="size-4 fill-current" />
              Mulai Buat Klip Sekarang
            </Link>
            <a
              href="#demo-interactive"
              className="w-full sm:w-auto py-3.5 px-6 rounded-xl border border-border bg-card text-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:bg-surface active:scale-[0.98] transition-colors"
            >
              Lihat Studio Interaktif
            </a>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground font-medium">
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

        {/* ═══ INTERACTIVE STUDIO STAGE ═══ */}
        <div id="demo-interactive" className="mt-16 sm:mt-24 border-t border-border pt-10">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-medium text-muted-foreground tracking-wide">
                Interactive Studio Playground · 9:16 Reframe
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFaceTrackingActive(!faceTrackingActive)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  faceTrackingActive
                    ? "bg-accent text-accent-foreground"
                    : "bg-surface text-muted-foreground border border-border"
                }`}
                title="Toggle Face-Tracking Reframe"
              >
                <Scissors className="size-3.5" />
                <span>Face-Tracking: {faceTrackingActive ? "ON" : "OFF"}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsPlaying(!isPlaying)}
                className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-surface text-foreground hover:bg-card transition-colors"
              >
                {isPlaying ? <Pause className="size-4" /> : <Play className="size-4 translate-x-0.5" />}
              </button>
            </div>
          </div>

          <div className="grid lg:grid-cols-[1fr_360px] gap-10 items-center pt-8">
            {/* Phone Canvas (Clean flat ring frame, zero shadow-card heuristic) */}
            <div className="flex justify-center py-4">
              <div className="relative w-[280px] sm:w-[310px] aspect-[9/16] rounded-[2.25rem] ring-8 ring-neutral-900 bg-neutral-950 overflow-hidden flex flex-col justify-between p-4">
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
                    <div className="size-full bg-neutral-900 relative flex items-center justify-center">
                      <div
                        className={`size-32 rounded-full bg-neutral-800 transition-transform duration-700 ${
                          faceTrackingActive ? "scale-105 translate-y-[-10%]" : "translate-x-[-25%]"
                        }`}
                      >
                        <div className="size-full flex items-center justify-center text-xs font-mono text-neutral-400">
                          [Speaker]
                        </div>
                      </div>

                      {faceTrackingActive && (
                        <div className="absolute size-40 rounded-2xl outline outline-2 outline-accent outline-dashed pointer-events-none flex flex-col justify-between p-2">
                          <span className="text-xs font-mono font-bold uppercase bg-accent text-accent-foreground px-1.5 py-0.5 rounded self-start">
                            AI TRACK: 98%
                          </span>
                          <span className="size-2 rounded-full bg-accent self-end" />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="relative z-10 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 rounded-full bg-black/80 px-3 py-1.5 text-xs font-bold text-white">
                    <Sparkles className="size-3 text-amber-400" /> VIRAL SCORE: 96
                  </span>
                  <span className="font-mono text-xs text-white bg-black/80 px-2 py-1 rounded">
                    00:24
                  </span>
                </div>

                <div className="relative z-10 pb-8 text-center px-2">
                  <div className={`${activeTheme.font} text-xl sm:text-2xl leading-snug flex flex-wrap justify-center gap-x-1.5 gap-y-1`}>
                    {MOCK_WORDS.map((w, idx) => {
                      const isCurrent = idx === currentWordIndex;
                      return (
                        <span
                          key={w.text}
                          className={`transition-transform duration-200 ${
                            isCurrent ? activeTheme.activeWordStyle : activeTheme.wordStyle
                          }`}
                        >
                          {w.text}
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div className="relative z-10 flex justify-center">
                  <span className="text-xs font-sans font-medium text-white/60 tracking-wider">
                    CortexClip AI
                  </span>
                </div>
              </div>
            </div>

            {/* Theme Selector */}
            <div className="space-y-5">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-accent flex items-center gap-1.5">
                  <Sliders className="size-3.5" /> Preset Karaoke
                </span>
                <h2 className="text-xl font-display font-bold text-foreground mt-1">
                  Ganti Gaya Subtitle Langsung
                </h2>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-[50ch]">
                  Pilih preset karaoke di bawah untuk melihat animasi teks berubah seketika di canvas 9:16.
                </p>
              </div>

              <div className="divide-y divide-border border-y border-border">
                {THEMES.map((theme) => {
                  const isSelected = activeTheme.id === theme.id;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => setActiveTheme(theme)}
                      className={`w-full text-left py-3.5 px-2 transition-colors flex items-center justify-between ${
                        isSelected
                          ? "bg-accent/10"
                          : "hover:bg-surface"
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-display text-sm font-bold text-foreground">
                            {theme.name}
                          </span>
                          <span className="text-xs font-mono px-2 py-0.5 rounded bg-surface border border-border text-foreground font-medium">
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

              <div className="space-y-2 pt-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-foreground font-medium">AI Hook Score</span>
                  <span className="font-bold font-mono text-accent">98 / 100</span>
                </div>
                <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
                  <div className="h-full bg-accent w-[98%]" />
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed pt-1 max-w-[50ch]">
                  AI memotong momen dengan emosi puncak dan hook tertinggi agar video tidak di-skip.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
