import { motion } from "motion/react";
import { Upload, BrainCircuit, Scissors, Rocket } from "lucide-react";

const steps = [
  {
    n: "1",
    icon: Upload,
    title: "Unggah",
    desc: "Video atau link YouTube.",
  },
  {
    n: "2",
    icon: BrainCircuit,
    title: "Transkripsi + skor",
    desc: "AI memahami isi & menilai momen.",
  },
  {
    n: "3",
    icon: Scissors,
    title: "Potong otomatis",
    desc: "Klip terbaik dipilih & diberi judul.",
  },
  {
    n: "4",
    icon: Rocket,
    title: "Siap unggah",
    desc: "Ekspor MP4/WebM + metadata siap pakai.",
  },
];

export function Pipeline() {
  return (
    <section id="alur" className="border-y border-border bg-surface/60">
      <div className="mx-auto max-w-6xl scroll-mt-28 px-5 py-24">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-xl"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Alur kerja</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Dari panjang ke virall — 4 langkah.
          </h2>
        </motion.div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="relative"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-xl border border-border bg-card text-accent shadow-sm">
                  <s.icon className="size-5" />
                </span>
                <span className="font-display text-sm font-bold text-muted-foreground/60">0{s.n}</span>
              </div>
              <h3 className="mt-3 font-bold tracking-tight">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
              {i < steps.length - 1 ? (
                <div className="absolute left-10 top-5 hidden h-px w-[calc(100%-2.5rem)] bg-border lg:block" />
              ) : null}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
