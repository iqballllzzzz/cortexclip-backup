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
      "Caption multi-bahasa",
    ],
  },
];

const faqs = [
  {
    q: "Apakah bisa langsung dari URL YouTube?",
    a: "Bisa. Tempel link video, CortexClip mengambil audio, mentranskrip, dan memilih momen terbaik tanpa unduh manual.",
  },
  {
    q: "Bagaimana virality score dihitung?",
    a: "AI menilai kekuatan hook 3 detik pertama, kejelasan konteks, ketegangan cerita, dan penutup. Skor 85+ layak diprioritaskan.",
  },
  {
    q: "Bisakah overlay ikon dimatikan?",
    a: "Ya. Semua bisa diatur per proyek — konten edukasi dan komedi punya kebutuhan yang berbeda.",
  },
  {
    q: "Bahasa apa saja yang didukung?",
    a: "Bahasa Indonesia, Inggris, dan puluhan bahasa lain, dengan opsi menerjemahkan caption ke bahasa target.",
  },
];

export function PricingFaq() {
  return (
    <>
      <section id="harga" className="mx-auto max-w-6xl scroll-mt-28 px-5 py-24">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-xl"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Harga</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Mulai gratis, naik saat butuh.
          </h2>
        </motion.div>

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {plans.map((p, i) => (
            <motion.div
              key={p.name}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.07 }}
              className={`relative flex flex-col rounded-3xl border p-6 shadow-sm transition-shadow hover:shadow-md ${
                p.highlight ? "border-accent bg-accent/5" : "border-border bg-card"
              }`}
            >
              {p.highlight ? (
                <span className="absolute -top-3 left-6 rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-semibold text-accent-foreground">
                  Paling populer
                </span>
              ) : null}
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {p.name}
              </h3>
              <p className="mt-3 font-display text-3xl font-bold tracking-tight">{p.price}</p>
              <p className="mt-1 text-xs text-muted-foreground">{p.note}</p>
              <ul className="mt-5 flex-1 space-y-2.5">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <span className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full ${p.highlight ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"}`}>
                      <Check className="size-3" />
                    </span>
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>
              <Button asChild variant={p.highlight ? "accent" : "outline"} className="mt-6 w-full rounded-full">
                <a href="/studio">Pilih {p.name}</a>
              </Button>
            </motion.div>
          ))}
        </div>
      </section>

      <section id="faq" className="border-t border-border bg-surface/60">
        <div className="mx-auto max-w-3xl scroll-mt-28 px-5 py-24">
          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl font-bold tracking-tight sm:text-4xl"
          >
            Pertanyaan umum
          </motion.h2>
          <div className="mt-8">
            <Accordion type="single" collapsible className="space-y-3">
              {faqs.map((f) => (
                <AccordionItem
                  key={f.q}
                  value={f.q}
                  className="rounded-2xl border border-border bg-card px-5 shadow-sm"
                >
                  <AccordionTrigger className="text-left text-base">{f.q}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>
    </>
  );
}
