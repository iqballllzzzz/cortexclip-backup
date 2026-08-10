import { motion } from "motion/react";
import { ArrowRight, Link2, Play, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CaptionPreview, defaultCaptionStyle } from "@/components/caption-preview";
import { demoClips } from "@/data/demo-clips";

const stats = [
  { value: "10x", label: "Klip per video panjang" },
  { value: "< 4 mnt", label: "Rata-rata waktu proses" },
  { value: "98%", label: "Akurasi transkrip ID/EN" },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 aurora" aria-hidden="true" />
      <div className="absolute inset-0 grid-lines opacity-40" aria-hidden="true" />

      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-16 lg:grid-cols-[1.15fr_0.85fr] lg:pt-24">
        <div>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground"
          >
            <Sparkles className="size-3.5 text-accent" />
            AI auto-clipper untuk podcast, webinar, dan ceramah
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.05 }}
            className="mt-5 text-balance text-4xl font-bold leading-[1.05] sm:text-6xl"
          >
            Satu video panjang.
            <br />
            Puluhan klip yang{" "}
            <span className="relative inline-block">
              <span className="relative z-10">layak viral.</span>
              <span
                className="absolute inset-x-0 bottom-1 z-0 h-3 rounded bg-accent/60"
                aria-hidden="true"
              />
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.12 }}
            className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg"
          >
            CortexClip menganalisis transkrip, mencari momen terbaik, memotong otomatis ke rasio
            9:16, dan menempelkan caption karaoke yang interaktif — lengkap dengan judul, deskripsi,
            hashtag, dan skor viralitas.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.18 }}
            className="mt-8 flex w-full max-w-xl flex-col gap-3 rounded-2xl border border-border bg-card p-3 shadow-soft sm:flex-row"
          >
            <div className="flex flex-1 items-center gap-2 rounded-xl bg-surface px-3">
              <Link2 className="size-4 shrink-0 text-muted-foreground" />
              <Input
                aria-label="Tempel URL YouTube"
                placeholder="Tempel link YouTube atau unggah video…"
                className="border-0 bg-transparent shadow-none focus-visible:ring-0"
              />
            </div>
            <Button asChild variant="accent" size="lg">
              <Link to="/auth">
                Buat Klip <ArrowRight className="size-4" />
              </Link>
            </Button>
          </motion.div>

          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Upload className="size-3.5" /> MP4, MOV, MKV sampai 4 jam
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Play className="size-3.5" /> Tanpa kartu kredit
            </span>
          </div>

          <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl border border-border bg-card p-4">
                <dt className="font-display text-2xl font-bold">{s.value}</dt>
                <dd className="mt-1 text-xs text-muted-foreground">{s.label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15, ease: [0.2, 0.8, 0.2, 1] }}
          className="relative mx-auto w-full max-w-[300px]"
        >
          <div className="absolute -inset-6 rounded-[2rem] bg-accent/10 blur-2xl" aria-hidden />
          <CaptionPreview clip={demoClips[0]!} style={defaultCaptionStyle} className="shadow-lift" />
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="absolute -left-6 top-10 rounded-xl border border-border bg-card px-3 py-2 shadow-lift"
          >
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Virality score
            </p>
            <p className="font-display text-xl font-bold text-accent">94</p>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
