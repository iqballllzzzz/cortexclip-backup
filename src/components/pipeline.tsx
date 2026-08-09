import { motion } from "motion/react";

const steps = [
  {
    n: "01",
    title: "Masukkan sumber",
    body: "Unggah file video atau tempel URL YouTube. Audio diekstrak dan dinormalisasi otomatis.",
  },
  {
    n: "02",
    title: "Transkrip presisi kata",
    body: "Speech-to-text menghasilkan timestamp per kata — pondasi caption karaoke dan potongan cerdas.",
  },
  {
    n: "03",
    title: "Analisis momen",
    body: "AI menilai hook, klimaks, dan penutup lalu menyusun kandidat klip beserta virality score.",
  },
  {
    n: "04",
    title: "Render vertikal",
    body: "Face tracking, caption, overlay ikon, dan b-roll dibakar ke video 9:16 siap unggah.",
  },
  {
    n: "05",
    title: "Publikasikan",
    body: "Unduh, ekspor XML ke Premiere, atau jadwalkan langsung ke TikTok, Shorts, dan Reels.",
  },
];

export function Pipeline() {
  return (
    <section id="alur" className="scroll-mt-20 border-y border-border bg-surface">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Alur kerja</p>
          <h2 className="mt-3 text-3xl font-bold sm:text-4xl">Dari mentah ke siap tayang.</h2>
        </div>

        <ol className="mt-10 grid gap-4 md:grid-cols-5">
          {steps.map((s, i) => (
            <motion.li
              key={s.n}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: i * 0.07 }}
              className="relative rounded-2xl border border-border bg-card p-5"
            >
              <span className="font-display text-xs font-bold text-accent">{s.n}</span>
              <h3 className="mt-2 text-sm font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{s.body}</p>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}
