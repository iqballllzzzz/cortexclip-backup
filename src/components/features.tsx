import { motion } from "motion/react";
import {
  Captions,
  Gauge,
  Headphones,
  ScanFace,
  Sparkles,
  Wand2,
  Layers,
} from "lucide-react";

/* Bento grid: asymmetric tile sizes, hairline borders, no glow. */

const tiles = [
  {
    icon: Captions,
    title: "Caption karaoke",
    desc: "Subtitle per-kata tanpa delay, 4 gaya efek, hitam-putih yang bersih.",
    span: "sm:col-span-2 sm:row-span-2",
    size: "lg",
  },
  {
    icon: Gauge,
    title: "Virality score",
    desc: "Tiap potongan dinilai objektif.",
    span: "sm:col-span-1",
    size: "sm",
  },
  {
    icon: ScanFace,
    title: "Face tracking",
    desc: "Auto-framing wajah, tetap fokus saat bicara.",
    span: "sm:col-span-1",
    size: "sm",
  },
  {
    icon: Wand2,
    title: "Auto metadata",
    desc: "Judul, deskripsi, dan hashtag ditulis AI sekaligus.",
    span: "sm:col-span-1",
    size: "sm",
  },
  {
    icon: Layers,
    title: "Banyak rasio",
    desc: "9:16, 1:1, dan 16:9 — siap multi-platform.",
    span: "sm:col-span-1",
    size: "sm",
  },
  {
    icon: Headphones,
    title: "Transkripsi akurat",
    desc: "Whisper-grade STT dengan dukungan Bahasa Indonesia & Inggris.",
    span: "sm:col-span-2",
    size: "sm",
  },
];

export function Features() {
  return (
    <section id="fitur" className="mx-auto max-w-6xl scroll-mt-28 px-5 py-24">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="max-w-xl"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Fitur</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
          Paket lengkap, tetap sederhana.
        </h2>
        <p className="mt-3 text-muted-foreground">
          Semua yang dibutuhkan untuk mengubah video panjang jadi konten pendek — satu alur, tidak
          bertele-tele.
        </p>
      </motion.div>

      <div className="mt-10 grid gap-4 sm:grid-cols-4">
        {tiles.map((t, i) => (
          <motion.div
            key={t.title}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: i * 0.05 }}
            className={`flex flex-col gap-3 rounded-3xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md ${t.span}`}
          >
            <span className="flex size-10 items-center justify-center rounded-xl border border-border bg-background text-accent">
              <t.icon className="size-5" />
            </span>
            <h3 className={`font-bold tracking-tight ${t.size === "lg" ? "text-xl" : "text-base"}`}>
              {t.title}
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{t.desc}</p>
            {t.size === "lg" ? (
              <div className="mt-auto hidden gap-1.5 sm:flex">
                {["classic", "glow", "pop", "box"].map((s) => (
                  <span
                    key={s}
                    className="rounded-full border border-border bg-background px-2.5 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {s}
                  </span>
                ))}
              </div>
            ) : (
              <span className="mt-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Sparkles className="size-3 text-accent" /> otomatis
              </span>
            )}
          </motion.div>
        ))}
      </div>
    </section>
  );
}
