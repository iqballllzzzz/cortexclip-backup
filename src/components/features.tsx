"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ScanFace,
  Subtitles,
  Scissors,
  Gauge,
  TrendingUp,
} from "lucide-react";

type FeatureTab = "framing" | "karaoke" | "scoring" | "split";

export function Features() {
  const [activeTab, setActiveTab] = useState<FeatureTab>("framing");
  const [cropPosition, setCropPosition] = useState(50); // 0 to 100%
  const [selectedWordHighlight, setSelectedWordHighlight] = useState(2);

  return (
    <section id="fitur" className="py-24 sm:py-32 bg-background border-t border-border relative overflow-hidden">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mb-16">
          <h2 className="text-3xl sm:text-5xl font-display font-extrabold tracking-[-0.03em] leading-[1.08] text-foreground">
            Teknologi yang Bikin Penonton Berhenti Scroll.
          </h2>
          <p className="mt-4 text-base sm:text-lg leading-relaxed text-muted-foreground max-w-[65ch]">
            Bukan sekadar memotong video. Setiap frame dianalisis untuk menjaga fokus visual, keterbacaan subtitle, dan tempo cerita yang memicu algoritma Reels & TikTok.
          </p>
        </div>

        {/* Feature Navigation Tabs (Open grid, zero outer card box) */}
        <div className="border-y border-border grid grid-cols-2 lg:grid-cols-4 divide-x divide-border" role="tablist">
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
                className={`p-4 sm:p-5 text-left transition-colors relative ${
                  isSelected ? "bg-surface text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-surface/50"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <tab.icon className={`size-4.5 ${isSelected ? "text-accent" : "text-muted-foreground"}`} />
                  <span className="font-display text-sm font-bold tracking-tight">{tab.label}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 hidden sm:block font-sans">{tab.desc}</p>
                {isSelected && (
                  <div className="absolute bottom-0 inset-x-0 h-[2.5px] bg-accent" />
                )}
              </button>
            );
          })}
        </div>

        {/* Interactive Feature Viewport */}
        <div className="py-12 sm:py-16 min-h-[440px] flex items-center justify-center">
          <AnimatePresence mode="wait">
            {/* Tab 1: Smart Auto-Reframe */}
            {activeTab === "framing" && (
              <motion.div
                key="framing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="w-full grid lg:grid-cols-[1.2fr_1fr] gap-10 items-center"
              >
                <div>
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent">
                    01 · COMPUTER VISION
                  </span>
                  <h3 className="text-2xl sm:text-3xl font-display font-extrabold text-foreground mt-2">
                    Kamera 9:16 yang Bergerak Sendiri Mengikuti Wajah
                  </h3>
                  <p className="text-sm sm:text-base text-muted-foreground mt-3 leading-relaxed max-w-[55ch]">
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
                <div className="relative aspect-[16/9] w-full bg-neutral-900 border-y border-border overflow-hidden flex items-center justify-center p-2">
                  <div className="absolute inset-0 bg-neutral-950 flex items-center justify-between px-8 opacity-40">
                    <div className="size-16 rounded-full bg-neutral-800" />
                    <div className="size-16 rounded-full bg-neutral-800" />
                  </div>

                  <div
                    className="absolute size-20 rounded-full bg-accent/40 flex items-center justify-center text-xs font-mono font-bold text-accent-foreground transition-[left,transform] duration-300"
                    style={{ left: `calc(${cropPosition}% - 40px)` }}
                  >
                    Speaker
                  </div>

                  <div
                    className="absolute h-full aspect-[9/16] outline outline-2 outline-white rounded-lg pointer-events-none transition-[left,transform] duration-300 flex flex-col justify-between p-2"
                    style={{ left: `calc(${cropPosition}% - 72px)` }}
                  >
                    <span className="text-xs font-mono font-bold uppercase bg-white text-black px-1.5 py-0.5 rounded self-start">
                      9:16 CROP
                    </span>
                    <span className="text-xs font-mono text-white bg-black/80 px-2 py-0.5 rounded self-center">
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
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="w-full grid lg:grid-cols-[1.2fr_1fr] gap-10 items-center"
              >
                <div>
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent">
                    02 · KINETIC SUBTITLES
                  </span>
                  <h3 className="text-2xl sm:text-3xl font-display font-extrabold text-foreground mt-2">
                    Subtitle Karaoke Persis Kata Demi Kata
                  </h3>
                  <p className="text-sm sm:text-base text-muted-foreground mt-3 leading-relaxed max-w-[55ch]">
                    Menggunakan Whisper Speech-to-Text dengan alignment presisi milidetik. Kata yang sedang diucapkan menyala terang secara instan, membuat retensi penonton bertahan hingga detik akhir.
                  </p>

                  <div className="mt-6 flex flex-wrap gap-2">
                    {["Hormozi Gold", "MrBeast Punch", "TikTok Pop", "Clean Sermon", "Neon Glow"].map((preset) => (
                      <span key={preset} className="px-3 py-1.5 rounded-lg border border-border bg-surface text-xs font-semibold text-foreground">
                        {preset}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-neutral-950 p-6 text-center space-y-4">
                  <p className="text-xs font-mono text-neutral-400 uppercase">
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
                          className={`font-display font-black text-2xl sm:text-3xl tracking-tight px-2 py-1 rounded-lg transition-colors ${
                            isHighlighted
                              ? "text-amber-400 bg-amber-400/20"
                              : "text-white/60 hover:text-white"
                          }`}
                        >
                          {w}
                        </button>
                      );
                    })}
                  </div>
                  <div className="text-xs text-neutral-400 font-mono">
                    Timestamp: 00:01.420 · Alignment: 99.8% match
                  </div>
                </div>
              </motion.div>
            )}

            {/* Tab 3: Virality Score Engine */}
            {activeTab === "scoring" && (
              <motion.div
                key="scoring"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="w-full grid lg:grid-cols-[1.2fr_1fr] gap-10 items-center"
              >
                <div>
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent">
                    03 · PREDICTIVE AI
                  </span>
                  <h3 className="text-2xl sm:text-3xl font-display font-extrabold text-foreground mt-2">
                    Virality Score: Tahu Klip Mana yang Bakal Meledak
                  </h3>
                  <p className="text-sm sm:text-base text-muted-foreground mt-3 leading-relaxed max-w-[55ch]">
                    Kamu tidak perlu menonton ulang video 1 jam penuh. AI menganalisis transkrip dan dinamika vokal untuk menemukan potongan dengan potensi engagement tertinggi.
                  </p>

                  <div className="mt-6 flex items-center gap-3">
                    <div className="p-3 rounded-xl border border-border bg-surface flex items-center gap-3">
                      <TrendingUp className="size-6 text-emerald-600" />
                      <div>
                        <div className="font-display font-bold text-sm text-foreground">Skor 85+</div>
                        <div className="text-xs text-muted-foreground">Rekomendasi Utama Unggah</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-surface p-6 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-border">
                    <span className="font-display font-bold text-sm text-foreground">Klip #01 — Analisis Hook</span>
                    <span className="font-display font-extrabold text-2xl text-accent">96 <span className="text-xs font-normal text-muted-foreground">/ 100</span></span>
                  </div>

                  <div className="space-y-3 pt-1">
                    {[
                      { label: "Hook 3 Detik Pertama", val: 98, color: "bg-emerald-600" },
                      { label: "Alur Emosi & Ketegangan", val: 92, color: "bg-accent" },
                      { label: "Kejelasan Pokok Bahasan", val: 95, color: "bg-sky-600" },
                      { label: "Call-to-Action / Ending", val: 89, color: "bg-indigo-600" },
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
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="w-full grid lg:grid-cols-[1.2fr_1fr] gap-10 items-center"
              >
                <div>
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent">
                    04 · PODCAST ARCHITECTURE
                  </span>
                  <h3 className="text-2xl sm:text-3xl font-display font-extrabold text-foreground mt-2">
                    Auto Split: Dialog 2 Orang Jadi Tumpukan Atas-Bawah
                  </h3>
                  <p className="text-sm sm:text-base text-muted-foreground mt-3 leading-relaxed max-w-[55ch]">
                    Untuk video obrolan podcast atau wawancara, AI mendeteksi kapan dua pembicara saling berinteraksi dan otomatis membagi layar vertikal menjadi format split atas-bawah.
                  </p>

                  <div className="mt-6 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="px-3 py-1 rounded-md bg-surface border border-border">✓ Otomatis Deteksi 2 Wajah</span>
                    <span className="px-3 py-1 rounded-md bg-surface border border-border">✓ Transisi Mulus</span>
                    <span className="px-3 py-1 rounded-md bg-surface border border-border">✓ Subtitle Tetap di Tengah</span>
                  </div>
                </div>

                <div className="relative aspect-[9/16] w-[210px] mx-auto rounded-2xl border-4 border-neutral-900 bg-black overflow-hidden flex flex-col">
                  <div className="flex-1 border-b-2 border-accent bg-neutral-900 flex items-center justify-center relative">
                    <span className="text-xs font-mono text-neutral-300 font-bold">[Pembicara 1 - Host]</span>
                    <span className="absolute top-2 left-2 text-xs font-mono uppercase bg-accent text-accent-foreground px-1.5 py-0.5 rounded font-bold">ACTIVE</span>
                  </div>
                  <div className="bg-black py-2 px-2 text-center text-xs font-bold text-amber-300 font-display">
                    "Tepat di momen itulah semuanya berubah..."
                  </div>
                  <div className="flex-1 bg-neutral-800 flex items-center justify-center relative">
                    <span className="text-xs font-mono text-neutral-300 font-bold">[Pembicara 2 - Guest]</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
