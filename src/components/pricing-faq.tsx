import { Check } from "lucide-react";
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
      <section id="harga" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Harga</p>
          <h2 className="mt-3 text-3xl font-bold sm:text-4xl">Mulai gratis, naik saat butuh.</h2>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {plans.map((p, i) => (
            <motion.div
              key={p.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: i * 0.08 }}
              className={
                p.highlight
                  ? "relative rounded-2xl border-2 border-accent bg-card p-6 shadow-lift"
                  : "rounded-2xl border border-border bg-card p-6"
              }
            >
              {p.highlight && (
                <span className="absolute -top-3 left-6 rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-foreground">
                  Paling populer
                </span>
              )}
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {p.name}
              </h3>
              <p className="mt-3 font-display text-3xl font-bold">{p.price}</p>
              <p className="mt-1 text-xs text-muted-foreground">{p.note}</p>
              <ul className="mt-5 space-y-2.5">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check className="mt-0.5 size-4 shrink-0 text-accent" />
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

      <section id="faq" className="border-t border-border bg-surface">
        <div className="mx-auto max-w-3xl scroll-mt-20 px-5 py-20">
          <h2 className="text-3xl font-bold sm:text-4xl">Pertanyaan umum</h2>
          <Accordion type="single" collapsible className="mt-8">
            {faqs.map((f) => (
              <AccordionItem key={f.q} value={f.q}>
                <AccordionTrigger className="text-left text-base">{f.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>
    </>
  );
}
