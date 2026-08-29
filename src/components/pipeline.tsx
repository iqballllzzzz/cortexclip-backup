import { motion } from "motion/react";
import { ArrowRight, Upload, AudioLines, BrainCircuit, MonitorPlay, Rocket } from "lucide-react";

const steps = [
  {
    n: "01",
    title: "Masukkan sumber",
    body: "Unggah file video atau tempel URL YouTube. Audio diekstrak dan dinormalisasi otomatis.",
    icon: Upload,
  },
  {
    n: "02",
    title: "Transkrip presisi kata",
    body: "Speech-to-text menghasilkan timestamp per kata — pondasi caption karaoke dan potongan cerdas.",
    icon: AudioLines,
  },
  {
    n: "03",
    title: "Analisis momen",
    body: "AI menilai hook, klimaks, dan penutup lalu menyusun kandidat klip beserta virality score.",
    icon: BrainCircuit,
  },
  {
    n: "04",
    title: "Render vertikal",
    body: "Face tracking, caption, overlay ikon, dan b-roll dibakar ke video 9:16 siap unggah.",
    icon: MonitorPlay,
  },
  {
    n: "05",
    title: "Publikasikan",
    body: "Unduh, ekspor XML ke Premiere, atau jadwalkan langsung ke TikTok, Shorts, dan Reels.",
    icon: Rocket,
  },
];

export function Pipeline() {
  return (
    <section id="alur" className="relative scroll-mt-20 border-y border-border bg-surface/60">
      <div className="mx-auto max-w-6xl px-5 py-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="max-w-2xl"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Alur kerja</p>
          <h2 className="mt-3 text-3xl font-bold sm:text-4xl">
            Dari mentah ke <span className="text-gradient-amber">siap tayang.</span>
          </h2>
          <p className="mt-3 text-muted-foreground">
            Lima langkah otomatis — kamu cukup menyediakan videonya, sisanya dikerjakan AI.
          </p>
        </motion.div>

        <div className="relative mt-12">
          {/* connector line (desktop) */}
          <div className="pointer-events-none absolute left-0 right-0 top-8 hidden h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent md:block" aria-hidden="true" />

          <ol className="grid gap-4 md:grid-cols-5">
            {steps.map((s, i) => (
              <motion.li
                key={s.n}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, delay: i * 0.1 }}
                className="group relative rounded-2xl border border-border bg-card p-5 card-hover-lift"
              >
                <div className="flex items-center justify-between">
                  <span className="flex size-8 items-center justify-center rounded-full bg-accent/10 font-display text-xs font-bold text-accent transition-all duration-300 group-hover:scale-110 group-hover:bg-accent group-hover:text-accent-foreground">
                    {s.n}
                  </span>
                  <s.icon className="size-4 text-muted-foreground/50 transition-colors group-hover:text-accent" />
                </div>
                <h3 className="mt-3 text-sm font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{s.body}</p>

                {/* arrow between (desktop) */}
                {i < steps.length - 1 && (
                  <ArrowRight className="absolute -right-3.5 top-1/2 z-10 hidden size-4 -translate-y-1/2 text-accent/50 md:block" aria-hidden="true" />
                )}
              </motion.li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}