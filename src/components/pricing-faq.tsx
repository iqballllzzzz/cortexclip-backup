import { Check, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const plans = [
  {
    name: "Starter",
    price: "Gratis",
    note: "60 menit unggah / bulan",
    features: ["10 klip per video", "Caption karaoke dasar", "Ekspor 720p", "Watermark ringan"],
    variant: "outline" as const,
  },
  {
    name: "Creator",
    price: "Rp 149rb",
    note: "per bulan · 15 jam unggah",
    features: [
      "Klip tanpa batas per video",
      "Virality score & auto-metadata",
      "Face tracking + overlay ikon",
      "Ekspor 1080p tanpa watermark",
      "Brand kit & template",
    ],
    highlight: true,
    variant: "accent" as const,
  },
  {
    name: "Agency",
    price: "Rp 549rb",
    note: "per bulan · 60 jam unggah",
    features: [
      "Semua fitur Creator",
      "Team workspace & hak akses",
      "Export XML + API access",
      "Auto-post scheduler",
      "Terjemahan caption multi-bahasa",
    ],
    variant: "outline" as const,
  },
];

const faqs = [
  {
    q: "Apakah bisa langsung dari URL YouTube?",
    a: "Bisa. Tempel link video, CortexClip akan mengambil audio, mentranskrip, dan memilih momen terbaik tanpa perlu unduh manual.",
  },
  {
    q: "Bagaimana virality score dihitung?",
    a: "AI menilai kekuatan hook tiga detik pertama, kejelasan konteks, ketegangan cerita, dan penutup. Skor 85+ biasanya layak diprioritaskan.",
  },
  {
    q: "Bisakah overlay ikon dimatikan?",
    a: "Ya. Klip podcast komedi biasanya lebih baik tanpa overlay, sedangkan konten edukasi seperti kelas finansial justru terbantu. Semuanya bisa diatur per proyek.",
  },
  {
    q: "Bahasa apa saja yang didukung?",
    a: "Transkrip mendukung Bahasa Indonesia, Inggris, dan puluhan bahasa lain, dengan opsi menerjemahkan caption ke bahasa target.",
  },
  {
    q: "Apakah hasilnya bisa diedit ulang?",
    a: "Bisa. Anda dapat mengubah teks, warna, posisi, dan potongan di editor, atau mengekspor XML untuk disempurnakan di Premiere Pro atau DaVinci Resolve.",
  },
];

export function PricingFaq() {
  return (
    <>
      <section id="harga" className="relative mx-auto max-w-6xl scroll-mt-20 px-5 py-24">
        <div className="pointer-events-none absolute left-0 top-1/4 size-72 rounded-full bg-accent/5 blur-3xl" aria-hidden="true" />

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
          className="max-w-2xl"
        >
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            <Sparkles className="size-3.5" /> Harga
          </p>
          <h2 className="mt-3 text-3xl font-bold sm:text-4xl">
            Mulai gratis, <span className="text-gradient-amber">naik saat butuh.</span>
          </h2>
        </motion.div>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {plans.map((p, i) => (
            <motion.div
              key={p.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: i * 0.08 }}
              className={`relative overflow-hidden rounded-2xl p-6 card-hover-lift ${
                p.highlight
                  ? "border-2 border-accent bg-card shadow-lift"
                  : "border border-border bg-card"
              }`}
            >
              {p.highlight && (
                <>
                  <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-accent/15 blur-2xl" aria-hidden="true" />
                  <span className="absolute -top-3 left-6 rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-foreground shadow-soft">
                    Paling populer
                  </span>
                </>
              )}
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {p.name}
              </h3>
              <p className="mt-3 font-display text-3xl font-bold">{p.price}</p>
              <p className="mt-1 text-xs text-muted-foreground">{p.note}</p>
              <ul className="mt-5 space-y-2.5">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full ${p.highlight ? "bg-accent text-accent-foreground" : "bg-accent/10 text-accent"}`}>
                      <Check className="size-3" />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <Button asChild variant={p.variant} className="mt-6 w-full">
                <a href="/studio">Pilih {p.name}</a>
              </Button>
            </motion.div>
          ))}
        </div>
      </section>

      <section id="faq" className="border-t border-border bg-surface/60">
        <div className="mx-auto max-w-3xl scroll-mt-20 px-5 py-24">
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-3xl font-bold sm:text-4xl"
          >
            Pertanyaan <span className="text-gradient-amber">umum</span>
          </motion.h2>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-8"
          >
            <Accordion type="single" collapsible className="space-y-3">
              {faqs.map((f) => (
                <AccordionItem
                  key={f.q}
                  value={f.q}
                  className="rounded-2xl border border-border bg-card px-5 transition-colors hover:border-accent/40 data-[state=open]:border-accent/40"
                >
                  <AccordionTrigger className="text-left text-base">{f.q}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </motion.div>
        </div>
      </section>
    </>
  );
}