import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { ArrowRight, Play, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="relative mx-auto max-w-6xl px-5 pb-24 pt-36 sm:pt-40">
      {/* top padding clears the fixed floating nav */}
      <div className="grid items-center gap-12 lg:grid-cols-12">
        {/* Copy */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
          className="lg:col-span-7"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground shadow-xs">
            <span className="size-1.5 rounded-full bg-accent" />
            Auto-clipper AI untuk konten pendek
          </div>

          <h1 className="mt-6 max-w-2xl text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
            Satu video panjang, <span className="text-accent">banyak klip viral</span>.
          </h1>

          <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted-foreground">
            CortexClip memotong, memberi skor, menulis judul, dan membakar caption karaoke — semua
            otomatis dalam menit.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" variant="accent" className="rounded-full px-6">
              <Link to="/auth">
                Mulai Gratis <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full px-6">
              <Link to="/studio">
                <Play className="size-4" /> Lihat Studio
              </Link>
            </Button>
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <TrendingUp className="size-4 text-accent" /> 85+ skor viralitas
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-border" /> Tanpa kartu kredit
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-border" /> Caption karaoke bawaan
            </span>
          </div>
        </motion.div>

        {/* Right: glass stat stack (asymmetric) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="grid gap-4 sm:grid-cols-2 lg:col-span-5"
        >
          <div className="glass rounded-3xl p-6 shadow-md">
            <p className="text-sm text-muted-foreground">Klip per video</p>
            <p className="mt-2 font-display text-4xl font-bold tracking-tight">10–30</p>
            <div className="mt-4 h-8 overflow-hidden rounded-lg border border-border bg-background/40">
              <div className="h-full w-3/4 rounded-r-md bg-accent/80" />
            </div>
          </div>

          <div className="glass rounded-3xl p-6 shadow-md sm:mt-6">
            <p className="text-sm text-muted-foreground">Rata-rata skor</p>
            <p className="mt-2 font-display text-4xl font-bold tracking-tight">87</p>
            <div className="mt-4 flex items-center gap-1.5 text-sm text-accent">
              <TrendingUp className="size-4" /> naik 2.4× engagement
            </div>
          </div>

          <div className="glass col-span-2 rounded-3xl p-6 shadow-md">
            <p className="text-sm text-muted-foreground">Alur kerja</p>
            <p className="mt-2 max-w-sm font-display text-xl font-bold tracking-tight">
              Unggah → skor → potong → siap unggah
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {["Transkripsi", "Face tracking", "Karaoke", "Hashtag", "Scheduler"].map((t) => (
                <span key={t} className="rounded-full border border-border bg-background/40 px-2.5 py-1 text-xs text-muted-foreground">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
