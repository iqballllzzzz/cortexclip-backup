"use client";

import { useState, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { RotatingUrlPlaceholder } from "./rotating-url-placeholder";
import {
  ArrowRight,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Sparkles,
  Scissors,
  CheckCircle2,
  Zap,
  Sliders,
  Youtube,
  Layers,
  Wand2,
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
    name: "Hormozi Solar",
    badge: "VIRAL FAVORITE",
    font: "font-display uppercase tracking-wide",
    wordStyle: "text-white/90 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]",
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
    wordStyle: "text-white/80",
    activeWordStyle: "text-white bg-white/20 px-2 py-0.5 rounded font-bold",
    accentColor: "#ffffff",
  },
];

const PRESET_LINKS = [
  { label: "🎙️ Podcast 45 Menit", url: "https://www.youtube.com/watch?v=sample1", clips: 12 },
  { label: "💡 Video Edukasi / Essay", url: "https://www.youtube.com/watch?v=sample2", clips: 8 },
  { label: "🔥 Wawancara 2 Pembicara", url: "https://www.youtube.com/watch?v=sample3", clips: 14 },
];

export function Hero() {
  const [activeTheme, setActiveTheme] = useState<SubtitleTheme>(THEMES[0]!);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [faceTrackingActive, setFaceTrackingActive] = useState(true);
  const [inputUrl, setInputUrl] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const realVideoUrl =
    "https://cortexclip.eu.cc/storage/v1/object/public/video-uploads/d6a7ffe1-8168-4df4-848c-2ad4dac25835/rendered/1dd9e460-1e2a-4585-bd12-7c1a758c44c3.mp4";

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
  };

  return (
    <>
      {/* ═══ CLEAN, ULTRA-FAST HERO SECTION ═══ */}
      <section className="relative overflow-hidden bg-background pt-24 pb-16 sm:pt-32 sm:pb-24">
        {/* Subtle Ambient Radial Glow (Pure CSS, 0 CPU) */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-[800px] max-w-full rounded-full bg-gradient-to-b from-accent/15 via-accent/5 to-transparent blur-3xl opacity-70"
        />

        {/* Technical Subtle Grid Overlay */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.025] [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:3rem_3rem]"
        />

        <div className="relative z-10 mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/90 px-4 py-1.5 text-xs font-medium text-foreground shadow-sm">
            <span className="size-2 rounded-full bg-accent animate-pulse" />
            <span>AI Auto-Clipper Bahasa Indonesia Pertama</span>
            <span className="text-muted-foreground">·</span>
            <Link to="/auth" className="text-accent font-semibold inline-flex items-center gap-1 hover:underline">
              Coba Gratis <ArrowRight className="size-3" />
            </Link>
          </div>

          {/* Main Title */}
          <h1 className="mt-5 font-display text-[38px] sm:text-[62px] lg:text-[76px] font-extrabold tracking-[-0.035em] leading-[1.04] text-foreground">
            Satu Video Panjang. <br />
            <span className="text-accent">Puluhan Klip Siap Viral.</span>
          </h1>

          {/* Subtitle */}
          <p className="mt-4 mx-auto max-w-[58ch] text-sm sm:text-base md:text-lg leading-relaxed text-muted-foreground font-sans">
            Tempel link podcast atau webinar YouTube. AI mendeteksi hook 3 detik pertama, melacak wajah pembicara, dan merender subtitle karaoke dengan akurasi 99.8%.
          </p>

          {/* Interactive URL Generator Demo Input */}
          <div className="mt-6 mx-auto max-w-lg">
            <div className="flex flex-col sm:flex-row items-center gap-2 rounded-2xl border border-border bg-card/90 backdrop-blur-md p-1.5 shadow-2xl">
              <div className="flex flex-1 items-center gap-2 px-3 py-1.5 w-full">
                <Youtube className="size-4 text-red-500 shrink-0" />
                <div className="relative min-w-0 flex-1">
                  <RotatingUrlPlaceholder />
                  <input
                    type="text"
                    value={inputUrl}
                    onChange={(e) => setInputUrl(e.target.value)}
                    placeholder=" "
                    aria-label="Tempel link video"
                    className="absolute inset-0 w-full bg-transparent text-xs sm:text-sm text-foreground focus:outline-none"
                  />
                </div>
              </div>
              <Link
                to="/auth"
                className="w-full sm:w-auto py-2.5 px-5 rounded-xl bg-accent text-accent-foreground font-semibold text-xs flex items-center justify-center gap-1.5 hover:opacity-90 active:scale-98 transition-all shrink-0"
              >
                <Zap className="size-3.5 fill-current" />
                Generate Klip
              </Link>
            </div>

            {/* Quick Presets */}
            <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5 text-xs">
              <span className="text-muted-foreground text-[11px]">Preset:</span>
              {PRESET_LINKS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setInputUrl(p.url)}
                  className="px-2.5 py-1 rounded-md border border-border bg-surface text-muted-foreground hover:text-foreground hover:border-accent/40 text-[11px] transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ WORKSTATION STUDIO STAGE (Cinema 9:16 Monitor) ═══ */}
      <section id="demo-interactive" className="relative py-16 lg:py-24 bg-surface/40 border-t border-border">
        <div className="relative mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <span className="size-2 rounded-full bg-emerald-500" />
              <span className="text-xs font-mono font-medium text-muted-foreground tracking-wide">
                STUDIO WORKSTATION · LIVE PREVIEW ENGINE (1080x1920)
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
                onClick={toggleMute}
                className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-surface text-foreground hover:bg-card transition-colors"
                title={isMuted ? "Unmute Audio" : "Mute Audio"}
              >
                {isMuted ? <VolumeX className="size-4 text-muted-foreground" /> : <Volume2 className="size-4 text-accent" />}
              </button>

              <button
                type="button"
                onClick={togglePlay}
                className="inline-flex size-9 items-center justify-center rounded-lg border border-border bg-surface text-foreground hover:bg-card transition-colors"
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause className="size-4" /> : <Play className="size-4 translate-x-0.5" />}
              </button>
            </div>
          </div>

          <div className="grid lg:grid-cols-[1fr_360px] gap-10 items-center pt-8">
            {/* Real 9:16 Cinema Display Frame */}
            <div className="flex justify-center py-4">
              <div className="relative w-[280px] sm:w-[320px] aspect-[9/16] rounded-[2.25rem] ring-8 ring-neutral-900 bg-neutral-950 overflow-hidden flex flex-col justify-between p-4 shadow-2xl">
                {/* Real Live Rendered MP4 Video (100% Clean, No Obstructing Overlays) */}
                <div className="absolute inset-0 z-0 overflow-hidden bg-black">
                  <video
                    ref={videoRef}
                    src={realVideoUrl}
                    className="size-full object-cover"
                    playsInline
                    muted={isMuted}
                    loop
                    autoPlay
                  />
                </div>

                {/* Top Video HUD */}
                <div className="relative z-10 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 rounded-full bg-black/80 px-3 py-1.5 text-xs font-bold text-white border border-white/10">
                    <Sparkles className="size-3 text-amber-400" /> VIRAL SCORE: 100
                  </span>
                  <span className="font-mono text-xs text-white bg-black/80 px-2 py-1 rounded border border-white/10">
                    00:54
                  </span>
                </div>

                {/* Bottom Watermark */}
                <div className="relative z-10 flex justify-center pb-2">
                  <span className="text-xs font-sans font-medium text-white/60 tracking-wider">
                    CortexClip AI
                  </span>
                </div>
              </div>
            </div>

            {/* Theme & Metrics Sidebar */}
            <div className="space-y-6">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-accent flex items-center gap-1.5">
                  <Sliders className="size-3.5" /> Preset Karaoke
                </span>
                <h2 className="text-2xl font-display font-bold text-foreground mt-1">
                  Ganti Gaya Subtitle Langsung
                </h2>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed max-w-[50ch]">
                  Ketuk salah satu gaya di bawah. Tampilan video dan caption akan langsung menyesuaikan secara visual.
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
                        isSelected ? "bg-accent/10" : "hover:bg-surface"
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-display text-sm font-semibold text-foreground">
                            {theme.name}
                          </span>
                          <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] font-mono font-medium text-muted-foreground">
                            {theme.badge}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Font tebal gaya viral dengan efek highlight kata aktif per suku kata.
                        </p>
                      </div>
                      <div className="size-4 shrink-0 rounded-full border border-border flex items-center justify-center">
                        {isSelected ? <CheckCircle2 className="size-4 text-accent" /> : null}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Studio Telemetry Chips */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="rounded-xl border border-border bg-surface p-3 space-y-1">
                  <span className="text-[11px] font-mono text-muted-foreground flex items-center gap-1">
                    <Wand2 className="size-3 text-accent" /> Virality Engine
                  </span>
                  <p className="font-display text-base font-bold text-foreground">Hook 3s Otomatis</p>
                </div>
                <div className="rounded-xl border border-border bg-surface p-3 space-y-1">
                  <span className="text-[11px] font-mono text-muted-foreground flex items-center gap-1">
                    <Layers className="size-3 text-accent" /> Aspect Ratio
                  </span>
                  <p className="font-display text-base font-bold text-foreground">9:16 Vertical HD</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
