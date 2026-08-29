import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { ArrowRight, Link2, Play, Sparkles, Upload, Zap, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CaptionPreview, defaultCaptionStyle } from "@/components/caption-preview";
import { demoClips } from "@/data/demo-clips";

const stats = [
  { value: "10x", label: "Klip per video panjang" },
  { value: "< 4 mnt", label: "Rata-rata waktu proses" },
  { value: "98%", label: "Akurasi transkrip ID/EN" },
];

const logos = [
  "Podcast", "Webinar", "Ceramah", "Kelas", "Interview", "Vlog", "Live", "Kuliah",
];

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Mesh gradient background */}
      <div className="absolute inset-0 mesh-gradient" aria-hidden="true" />
      <div className="absolute inset-0 grid-lines opacity-30" aria-hidden="true" />
      {/* Glow orbs */}
      <div className="pointer-events-none absolute -left-24 top-24 size-72 rounded-full bg-accent/20 blur-3xl animate-pulse-glow" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-16 top-48 size-80 rounded-full bg-chart-2/15 blur-3xl animate-pulse-glow" style={{ animationDelay: "1.2s" }} aria-hidden="true" />

      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-24 pt-16 lg:grid-cols-[1.15fr_0.85fr] lg:pt-24">
        <div>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-medium text-accent"
          >
            <Sparkles className="size-3.5" />
            AI auto-clipper untuk podcast, webinar, dan ceramah
            <span className="size-1.5 rounded-full bg-accent animate-pulse-glow" />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="mt-6 text-balance text-4xl font-bold leading-[1.05] sm:text-6xl"
          >
            Satu video panjang.
            <br />
            Puluhan klip yang{" "}
            <span className="relative inline-block">
              <span className="text-gradient-amber relative z-10">layak viral.</span>
              <span
                className="absolute inset-x-0 bottom-1 z-0 h-3 rounded bg-accent/50 blur-[2px]"
                aria-hidden="true"
              />
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.12 }}
            className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg"
          >
            CortexClip menganalisis transkrip, mencari momen terbaik, memotong otomatis ke rasio
            9:16, dan menempelkan caption karaoke yang interaktif — lengkap dengan judul, deskripsi,
            hashtag, dan skor viralitas.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.18 }}
            className="mt-8 flex w-full max-w-xl flex-col gap-3 rounded-2xl border border-border bg-card/70 p-3 shadow-soft backdrop-blur-xl sm:flex-row"
          >
            <div className="flex flex-1 items-center gap-2 rounded-xl bg-surface px-3">
              <Link2 className="size-4 shrink-0 text-muted-foreground" />
              <Input
                aria-label="Tempel URL YouTube"
                placeholder="Tempel link YouTube atau unggah video…"
                className="border-0 bg-transparent shadow-none focus-visible:ring-0"
              />
            </div>
            <Button asChild variant="accent" size="lg" className="group">
              <Link to="/auth">
                Buat Klip <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
          </motion.div>

          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Upload className="size-3.5 text-accent" /> MP4, MOV, MKV sampai 4 jam
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Play className="size-3.5 text-accent" /> Tanpa kartu kredit
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Zap className="size-3.5 text-accent" /> Siap unggah dalam menit
            </span>
          </div>

          <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4">
            {stats.map((s) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.3 + stats.indexOf(s) * 0.08 }}
                className="rounded-xl border border-border bg-card/60 p-4 backdrop-blur-sm card-hover-lift"
              >
                <dt className="font-display text-2xl font-bold text-gradient-amber">{s.value}</dt>
                <dd className="mt-1 text-xs text-muted-foreground">{s.label}</dd>
              </motion.div>
            ))}
          </dl>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15, ease: [0.2, 0.8, 0.2, 1] }}
          className="relative mx-auto w-full max-w-[300px]"
        >
          <div className="absolute -inset-6 rounded-[2rem] bg-accent/15 blur-2xl animate-pulse-glow" aria-hidden />
          <CaptionPreview clip={demoClips[0]!} style={defaultCaptionStyle} className="shadow-lift" />

          {/* Floating virality badge */}
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="absolute -left-10 top-10 rounded-xl border border-accent/30 bg-card/80 px-3 py-2 shadow-lift backdrop-blur-xl"
          >
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Virality score</p>
            <p className="flex items-center gap-1 font-display text-xl font-bold text-accent">
              <TrendingUp className="size-4" /> 94
            </p>
          </motion.div>

          {/* Floating clip count badge */}
          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
            className="absolute -right-8 bottom-16 rounded-xl border border-border bg-card/80 px-3 py-2 shadow-lift backdrop-blur-xl"
          >
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Klip dibuat</p>
            <p className="font-display text-xl font-bold">12</p>
          </motion.div>
        </motion.div>
      </div>

      {/* Logo marquee */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.5 }}
        className="relative border-t border-border/60 py-6"
      >
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-5">
          <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Dibuat untuk
          </span>
          <div className="no-scrollbar overflow-hidden">
            <div className="flex w-max animate-marquee gap-8">
              {[...logos, ...logos].map((l, i) => (
                <span
                  key={`${l}-${i}`}
                  className="whitespace-nowrap text-sm font-semibold text-muted-foreground/70"
                >
                  {l}
                </span>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}