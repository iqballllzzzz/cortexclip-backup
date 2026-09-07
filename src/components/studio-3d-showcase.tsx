"use client";

import { StudioPhone3D } from "./studio-phone-3d";
import { Sparkles, Scan, Activity, Cpu, Layers } from "lucide-react";

export function Studio3DShowcase() {
  return (
    <section className="relative py-24 sm:py-32 border-t border-border bg-neutral-950 overflow-hidden">
      {/* Background Holographic Glow & Grid */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.03] [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:3rem_3rem]"
      />

      <div className="relative mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Column: Technical Narrative & Live Telemetry */}
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1 text-xs font-mono text-accent">
              <Cpu className="size-3.5" />
              <span>WEBGL 3D HARDWARE WORKSTATION</span>
            </div>

            <h2 className="text-3xl sm:text-5xl font-display font-extrabold tracking-[-0.03em] leading-[1.06] text-foreground">
              Desain 9:16 yang Dihitung Hingga ke Piksel Terakhir.
            </h2>

            <p className="text-base sm:text-lg leading-relaxed text-muted-foreground max-w-[55ch]">
              Setiap klip yang diproduksi CortexClip dirender langsung melalui pipeline GPU bertenaga tinggi. Gerakkan kursor pada canvas 3D di samping untuk melihat sudut presisi frame ponsel secara interaktif.
            </p>

            {/* Technical Specifications Strip */}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
              <div className="space-y-1">
                <span className="text-xs font-mono text-muted-foreground flex items-center gap-1.5">
                  <Activity className="size-3.5 text-accent" /> Latensi Render
                </span>
                <p className="font-display text-xl font-bold text-foreground">Sub-Detik (GPU)</p>
                <p className="text-xs text-muted-foreground">Parallel queue ffmpeg & libass</p>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-mono text-muted-foreground flex items-center gap-1.5">
                  <Scan className="size-3.5 text-accent" /> Akurasi Face Tracking
                </span>
                <p className="font-display text-xl font-bold text-foreground">15 FPS MediaPipe</p>
                <p className="text-xs text-muted-foreground">Auto-smooth zoom maks 1.55x</p>
              </div>
            </div>
          </div>

          {/* Right Column: Three.js Interactive 3D WebGL Canvas */}
          <div className="relative flex items-center justify-center rounded-3xl border border-border bg-neutral-900/40 p-2 sm:p-6 backdrop-blur-xl">
            <StudioPhone3D />
          </div>
        </div>
      </div>
    </section>
  );
}
