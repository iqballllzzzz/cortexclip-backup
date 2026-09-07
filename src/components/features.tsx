"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ScanFace,
  Subtitles,
  Sparkles,
  Scissors,
  Layers,
  Gauge,
  CheckCircle2,
  TrendingUp,
  Cpu,
  Tv,
} from "lucide-react";

type FeatureTab = "framing" | "karaoke" | "scoring" | "split";

export function Features() {
  const [activeTab, setActiveTab] = useState<FeatureTab>("framing");
  const [cropPosition, setCropPosition] = useState(50); // 0 to 100%
  const [selectedWordHighlight, setSelectedWordHighlight] = useState(2);

  return (
    <section id="fitur" className="py-24 sm:py-32 bg-surface/50 border-t border-border relative overflow-hidden">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-3xl mb-16">
          <p className="text-xs font-mono font-bold uppercase tracking-widest text-accent mb-3 flex items-center gap-2">
            <Cpu className="size-3.5" /> ARCHITECTED FOR RETENTION
          </p>
          <h2 className="text-3xl sm:text-5xl font-display font-extrabold tracking-[-0.03em] leading-[1.08] text-foreground">
            Teknologi yang Bikin Penonton Berhenti Scroll.
          </h2>
          <p className="mt-4 text-base sm:text-lg leading-relaxed text-muted-foreground">
            Bukan sekadar memotong video. Setiap frame dianalisis untuk menjaga fokus visual, keterbacaan subtitle, dan tempo cerita yang memicu algoritma Reels & TikTok.
          </p>
        </div>

        {/* Interactive Feature Stage */}
        <div className="rounded-3xl border border-border bg-card shadow-xl overflow-hidden">
          {/* Feature Navigation Tabs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 border-b border-border bg-surface/70" role="tablist">
            {[
              { id: "framing", label: "Smart Auto-Reframe", icon: ScanFace, desc: "Kamera Lacak Pembicara" },
              { id: "karaoke", label: "Sub-Second Karaoke", icon: Subtitles, desc: "Animasi Kata Mengikuti Suara" },
              { id: "scoring", label: "Virality Score Engine", icon: Gauge, desc: "Analisis Hook 3 Detik" },
              { id: "split", label: "Auto-Split Multi-Person", icon: Scissors, desc: "Format Podcast 2 Pembicara" },
            ].map((tab) => {
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setActiveTab(tab.id as FeatureTab)}
                  className={`p-4 sm:p-5 text-left transition-all relative border-r border-border/60 last:border-r-0 ${
                    isSelected ? "bg-card text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-card/40"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <tab.icon className={`size-4.5 ${isSelected ? "text-accent" : "text-muted-foreground"}`} />
                    <span className="font-display text-sm font-bold tracking-tight">{tab.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 hidden sm:block font-sans">{tab.desc}</p>
                  {isSelected && (
                    <motion.div
                      layoutId="feature-tab-active"
                      className="absolute bottom-0 inset-x-0 h-[2.5px] bg-accent"
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Interactive Feature Viewport */}
          <div className="p-6 sm:p-10 min-h-[440px] flex items-center justify-center">
            <AnimatePresence mode="wait">
              {/* Tab 1: Smart Auto-Reframe */}
              {activeTab === "framing" && (
                <motion.div
                  key="framing"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="w-full grid lg:grid-cols-[1.2fr_1fr] gap-10 items-center"
                >
                  <div>
                    <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent">
                      01 · COMPUTER VISION
                    </span>
                    <h3 className="text-2xl sm:text-3xl font-display font-extrabold text-foreground mt-2">
                      Kamera 9:16 yang Bergerak Sendiri Mengikuti Wajah
                    </h3>
                    <p className="text-sm sm:text-base text-muted-foreground mt-3 leading-relaxed">
                      Video YouTube berformat landscape (16:9). Algoritma AI CortexClip memindai posisi pembicara 15 kali per detik dan menggeser jendela vertikal secara mulus tanpa goyang.
                    </p>

                    <div className="mt-6 space-y-4">
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs font-mono">
                          <span className="text-muted-foreground">Simulasi Posisi Pembicara</span>
                          <span className="text-accent font-bold">{cropPosition}% Frame Width</span>
                        </div>
                        <input
                          type="range"
                          min="15"
                          max="85"
                          value={cropPosition}
                          onChange={(e) => setCropPosition(Number(e.target.value))}
                          className="w-full h-2 rounded-full bg-border accent-[var(--color-accent)] cursor-pointer"
                        />
                      </div>

                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span className="px-2.5 py-1 rounded-md bg-surface border border-border">✓ Anti-Bocor Hitam</span>
                        <span className="px-2.5 py-1 rounded-md bg-surface border border-border">✓ MediaPipe FaceMesh</span>
                        <span className="px-2.5 py-1 rounded-md bg-surface border border-border">✓ Zoom Maks 1.55x</span>
                      </div>
                    </div>
                  </div>

                  {/* Visual Simulation Stage */}
                  <div className="relative aspect-[16/9] w-full rounded-2xl bg-neutral-900 border border-border overflow-hidden flex items-center justify-center p-2">
                    {/* Simulated 16:9 Wide Stage */}
                    <div className="absolute inset-0 bg-neutral-950 flex items-center justify-between px-8 opacity-40">
                      <div className="size-16 rounded-full bg-neutral-800 border border-neutral-700" />
                      <div className="size-16 rounded-full bg-neutral-800 border border-neutral-700" />
                    </div>

                    {/* Active Speaker */}
                    <div
                      className="absolute size-20 rounded-full bg-accent/30 border-2 border-accent flex items-center justify-center text-xs font-mono font-bold text-accent transition-all duration-300"
                      style={{ left: `calc(${cropPosition}% - 40px)` }}
                    >
                      Speaker
                    </div>

                    {/* The 9:16 Camera Crop Window */}
                    <div
                      className="absolute h-full aspect-[9/16] border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.65)] rounded-lg pointer-events-none transition-all duration-300 flex flex-col justify-between p-2"
                      style={{ left: `calc(${cropPosition}% - 72px)` }}
                    >
                      <span className="text-[9px] font-mono font-bold uppercase bg-white text-black px-1 rounded self-start">
                        9:16 CROP
                      </span>
                      <span className="text-[8px] font-mono text-white/90 bg-black/60 px-1 py-0.5 rounded self-center">
                        Framing Centered
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Tab 2: Sub-Second Karaoke */}
              {activeTab === "karaoke" && (
                <motion.div
                  key="karaoke"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="w-full grid lg:grid-cols-[1.2fr_1fr] gap-10 items-center"
                >
                  <div>
                    <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent">
                      02 · KINETIC SUBTITLES
                    </span>
                    <h3 className="text-2xl sm:text-3xl font-display font-extrabold text-foreground mt-2">
                      Subtitle Karaoke Persis Kata Demi Kata
                    </h3>
                    <p className="text-sm sm:text-base text-muted-foreground mt-3 leading-relaxed">
                      Menggunakan Whisper Speech-to-Text dengan alignment presisi milidetik. Kata yang sedang diucapkan menyala terang secara instan, membuat retensi penonton bertahan hingga detik akhir.
                    </p>

                    <div className="mt-6 flex flex-wrap gap-2">
                      {["Hormozi Gold", "MrBeast Punch", "TikTok Pop", "Clean Sermon", "Neon Glow"].map((preset) => (
                        <span key={preset} className="px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-semibold text-foreground">
                          {preset}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Interactive Word Tap Canvas */}
                  <div className="rounded-2xl border border-border bg-neutral-950 p-6 text-center space-y-4">
                    <p className="text-xs font-mono text-muted-foreground uppercase">
                      Ketuk kata untuk melihat efek highlight:
                    </p>
                    <div className="flex flex-wrap justify-center gap-2 py-4">
                      {["Konten", "Viral", "Dibangun", "Lewat", "Retensi", "Tinggi"].map((w, idx) => {
                        const isHighlighted = selectedWordHighlight === idx;
                        return (
                          <button
                            key={w}
                            type="button"
                            onClick={() => setSelectedWordHighlight(idx)}
                            className={`font-display font-black text-2xl sm:text-3xl uppercase tracking-tight px-2 py-1 rounded-lg transition-all duration-150 ${
                              isHighlighted
                                ? "text-amber-400 bg-amber-400/15 scale-110 shadow-lg shadow-amber-400/20"
                                : "text-white/60 hover:text-white"
                            }`}
                          >
                            {w}
                          </button>
                        );
                      })}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">
                      Timestamp: 00:01.420 · Alignment: 99.8% match
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Tab 3: Virality Score Engine */}
              {activeTab === "scoring" && (
                <motion.div
                  key="scoring"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="w-full grid lg:grid-cols-[1.2fr_1fr] gap-10 items-center"
                >
                  <div>
                    <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent">
                      03 · PREDICTIVE AI
                    </span>
                    <h3 className="text-2xl sm:text-3xl font-display font-extrabold text-foreground mt-2">
                      Virality Score: Tahu Klip Mana yang Bakal Meledak
                    </h3>
                    <p className="text-sm sm:text-base text-muted-foreground mt-3 leading-relaxed">
                      Kamu tidak perlu menonton ulang video 1 jam penuh. AI menganalisis transkrip dan dinamika vokal untuk menemukan potongan dengan potensi engagement tertinggi.
                    </p>

                    <div className="mt-6 flex items-center gap-3">
                      <div className="p-3 rounded-xl border border-border bg-card flex items-center gap-3">
                        <TrendingUp className="size-6 text-emerald-500" />
                        <div>
                          <div className="font-display font-bold text-sm">Skor 85+</div>
                          <div className="text-xs text-muted-foreground">Rekomendasi Utama Unggah</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Score Breakdown Widget */}
                  <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-border">
                      <span className="font-display font-bold text-sm">Klip #01 — Analisis Hook</span>
                      <span className="font-display font-extrabold text-2xl text-accent">96 <span className="text-xs font-normal text-muted-foreground">/ 100</span></span>
                    </div>

                    <div className="space-y-3 pt-1">
                      {[
                        { label: "Hook 3 Detik Pertama", val: 98, color: "bg-emerald-500" },
                        { label: "Alur Emosi & Ketegangan", val: 92, color: "bg-accent" },
                        { label: "Kejelasan Pokok Bahasan", val: 95, color: "bg-sky-500" },
                        { label: "Call-to-Action / Ending", val: 89, color: "bg-indigo-500" },
                      ].map((bar) => (
                        <div key={bar.label} className="space-y-1">
                          <div className="flex justify-between text-xs font-medium">
                            <span className="text-muted-foreground">{bar.label}</span>
                            <span className="font-mono font-bold text-foreground">{bar.val}%</span>
                          </div>
                          <div className="h-1.5 w-full bg-border rounded-full overflow-hidden">
                            <div className={`h-full ${bar.color} rounded-full`} style={{ width: `${bar.val}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Tab 4: Auto-Split Multi-Person */}
              {activeTab === "split" && (
                <motion.div
                  key="split"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="w-full grid lg:grid-cols-[1.2fr_1fr] gap-10 items-center"
                >
                  <div>
                    <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent">
                      04 · PODCAST ARCHITECTURE
                    </span>
                    <h3 className="text-2xl sm:text-3xl font-display font-extrabold text-foreground mt-2">
                      Auto Split: Dialog 2 Orang Jadi Tumpukan Atas-Bawah
                    </h3>
                    <p className="text-sm sm:text-base text-muted-foreground mt-3 leading-relaxed">
                      Untuk video obrolan podcast atau wawancara, AI mendeteksi kapan dua pembicara saling berinteraksi dan otomatis membagi layar vertikal menjadi format split atas-bawah.
                    </p>

                    <div className="mt-6 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="px-3 py-1 rounded-md bg-surface border border-border">✓ Otomatis Deteksi 2 Wajah</span>
                      <span className="px-3 py-1 rounded-md bg-surface border border-border">✓ Transisi Mulus</span>
                      <span className="px-3 py-1 rounded-md bg-surface border border-border">✓ Subtitle Tetap di Tengah</span>
                    </div>
                  </div>

                  {/* Visual Split Screen Mockup */}
                  <div className="relative aspect-[9/16] w-[210px] mx-auto rounded-2xl border-4 border-neutral-900 bg-black overflow-hidden shadow-xl flex flex-col">
                    {/* Top Speaker Box */}
                    <div className="flex-1 border-b-2 border-accent/40 bg-neutral-900 flex items-center justify-center relative">
                      <span className="text-xs font-mono text-neutral-300 font-bold">[Pembicara 1 - Host]</span>
                      <span className="absolute top-2 left-2 text-[9px] font-mono uppercase bg-accent text-accent-foreground px-1 py-0.5 rounded font-bold">ACTIVE</span>
                    </div>
                    {/* Subtitle Divider Band */}
                    <div className="bg-black/90 py-1.5 px-2 text-center text-[10px] font-bold text-amber-300 font-display">
                      "Tepat di momen itulah semuanya berubah..."
                    </div>
                    {/* Bottom Speaker Box */}
                    <div className="flex-1 bg-neutral-800 flex items-center justify-center relative">
                      <span className="text-xs font-mono text-neutral-300 font-bold">[Pembicara 2 - Guest]</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
