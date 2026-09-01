import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";

import { CaptionPreview, defaultCaptionStyle } from "@/components/caption-preview";
import { demoClips } from "@/data/demo-clips";

/**
 * HERO landing — copy kiri berat, mockup klip vertikal kanan memakai
 * CaptionPreview sungguhan (bukan screenshot palsu). Asimetri 12/5.
 */
export function Hero() {
  const demo = demoClips[0];

  return (
    <section className="relative overflow-hidden">
      {/* satu gradasi tipis di belakang — bukan mesh berlapis */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(55% 42% at 78% 8%, color-mix(in oklab, var(--color-accent) 9%, transparent), transparent 72%)",
        }}
      />

      <div className="relative mx-auto grid max-w-[1180px] gap-14 px-4 pb-20 pt-16 sm:px-6 sm:pt-24 lg:grid-cols-12 lg:gap-8">
        <div className="reveal lg:col-span-7" style={{ ["--i" as string]: 0 }}>
          <p className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
            Auto-clipper AI · Bahasa Indonesia
          </p>

          <h1
            className="mt-6 font-display text-[38px] leading-[1.03] font-bold tracking-tight sm:text-[64px]"
            style={{ overflowWrap: "anywhere", minWidth: 0 }}
          >
            Satu video panjang,
            <br />
            <span className="text-accent">banyak klip viral.</span>
          </h1>

          <p className="mt-6 max-w-prose text-[16px] leading-relaxed text-muted-foreground sm:text-lg">
            Tempel link YouTube atau unggah video. CortexClip mentranskrip audio, memilih momen
            paling kuat, menulis judul dan hashtag, lalu merender klip vertikal dengan caption
            karaoke — kamu tinggal unggah.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              to="/auth"
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-7 text-[15px] font-semibold text-accent-foreground transition-transform hover:-translate-y-0.5"
            >
              Mulai gratis <ArrowRight className="size-4" />
            </Link>
            <a
              href="/#cara"
              className="inline-flex h-12 items-center rounded-xl border border-border px-7 text-[15px] font-semibold transition-colors hover:border-accent/50"
            >
              Lihat cara kerjanya
            </a>
          </div>

          <p className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-accent" /> 2 video gratis per hari
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-border" /> tanpa kartu kredit
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-border" /> render di server, bukan di HP
              kamu
            </span>
          </p>
        </div>

        {/* mockup klip asli — komponen CaptionPreview yang sama dipakai editor */}
        <motion.div
          initial={{ opacity: 0, y: 18, rotate: 1.5 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.12 }}
          className="mx-auto w-full max-w-[300px] lg:col-span-5 lg:mt-2 lg:justify-self-end"
        >
          {demo ? (
            <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-lg">
              <CaptionPreview
                clip={demo}
                style={{ ...defaultCaptionStyle, accent: "var(--color-accent)" }}
              />
              <div className="flex items-center justify-between px-4 py-3">
                <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted-foreground">
                  {demo.range}
                </span>
                <span className="stat-figure text-lg text-accent">{demo.score}/100</span>
              </div>
            </div>
          ) : null}
        </motion.div>
      </div>
    </section>
  );
}
