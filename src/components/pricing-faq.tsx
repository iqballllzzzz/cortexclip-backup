import { Link } from "@tanstack/react-router";
import { ChevronDown, Check, Zap, Sparkles } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";

export const FAQS = [
  {
    q: "Apakah bisa langsung dari URL YouTube?",
    a: "Bisa. Cukup tempel link YouTube, server kami yang mengunduh dan memproses langsung di cloud tanpa memakan kuota atau memori perangkatmu.",
  },
  {
    q: "Bagaimana virality score dihitung?",
    a: "AI menganalisis hook 3 detik pertama, tempo bicara, pergantian konteks emosional, dan kekuatan penutup. Klip dengan skor di atas 80 direkomendasikan untuk langsung diunggah.",
  },
  {
    q: "Apakah preview persis sama dengan hasil render?",
    a: "Persis 100%. Engine preview dan render final menggunakan pipeline libass dan ffmpeg yang sama, jadi subtitle, framing, dan timing yang kamu lihat di editor adalah hasil akhir MP4.",
  },
  {
    q: "Bagaimana cara kerja akses Premium Gratis via Iklan?",
    a: "Cukup tonton iklan reward singkat di dalam aplikasi untuk mengumpulkan kredit hari premium atau menghapus watermark secara instan tanpa perlu mengeluarkan biaya sepeser pun.",
  },
  {
    q: "Berapa harga paket berlangganan dibanding OpusClip?",
    a: "CortexClip Pro hanya Rp70.000/bulan dengan kuota hingga 10 video panjang per hari tanpa batasan menit yang ketat. Jauh lebih hemat dibanding OpusClip yang mengenakan biaya $19/bulan (~Rp300.000) dengan kuota menit terbatas.",
  },
  {
    q: "Metode pembayaran apa saja yang didukung?",
    a: "Pembayaran instan melalui QRIS yang mendukung seluruh e-wallet (GoPay, OVO, Dana, ShopeePay) serta aplikasi mobile banking di Indonesia.",
  },
];

export function PricingFaq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="bg-background">
      {/* ═══ PRICING SECTION (#harga) ═══ */}
      <section id="harga" className="scroll-mt-20 border-t border-border py-24 sm:py-32">
        <div className="mx-auto max-w-[1240px] px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center mb-16">
            <h2 className="text-3xl font-display font-extrabold tracking-tight sm:text-5xl text-foreground">
              Harga sederhana. Hasil maksimal.
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Mulai gratis atau beralih ke Creator Pro untuk fitur penuh tanpa watermark.
            </p>
          </div>

          <div className="mx-auto grid max-w-lg grid-cols-1 gap-8 lg:max-w-4xl lg:grid-cols-2">
            {/* Free Plan */}
            <div className="rounded-3xl border border-border bg-card p-8 sm:p-10 flex flex-col justify-between relative">
              <div>
                <div className="flex items-center justify-between gap-4">
                  <h3 className="font-display text-xl font-bold text-foreground">Gratis</h3>
                  <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Selamanya
                  </span>
                </div>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                  Cocok untuk mencoba kemampuan AI klip dan eksplorasi gaya caption.
                </p>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="font-display text-4xl font-extrabold text-foreground">Rp0</span>
                  <span className="text-sm text-muted-foreground">/ bulan</span>
                </div>

                <ul className="mt-8 space-y-3.5 text-sm text-muted-foreground border-t border-border pt-6">
                  {[
                    "2 video panjang per hari",
                    "Semua preset gaya subtitle karaoke",
                    "Auto Face-Tracking 9:16",
                    "Unduh kualitas HD 1080p",
                    "Watermark bisa dihapus via tonton iklan",
                  ].map((f) => (
                    <li key={f} className="flex items-center gap-3">
                      <Check className="size-4 text-accent shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-10">
                <Link
                  to="/auth"
                  className="inline-flex w-full h-11 items-center justify-center rounded-xl border border-border bg-background text-sm font-semibold text-foreground transition-colors hover:border-foreground active:scale-95"
                >
                  Mulai Sekarang
                </Link>
              </div>
            </div>

            {/* Pro Plan */}
            <div className="rounded-3xl border-2 border-accent bg-card p-8 sm:p-10 flex flex-col justify-between relative shadow-xl shadow-accent/5">
              <div className="absolute -top-3.5 right-8">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-bold uppercase tracking-wider text-accent-foreground shadow-sm">
                  <Sparkles className="size-3" /> Pilihan Utama
                </span>
              </div>

              <div>
                <div className="flex items-center justify-between gap-4">
                  <h3 className="font-display text-xl font-bold text-foreground">Creator Pro</h3>
                  <span className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-bold text-accent uppercase tracking-wider">
                    QRIS Instan
                  </span>
                </div>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                  Untuk konten kreator, podcaster, dan agency yang rutin memproduksi puluhan klip shorts/reels setiap hari.
                </p>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="font-display text-4xl font-extrabold text-foreground">Rp70.000</span>
                  <span className="text-sm text-muted-foreground">/ bulan</span>
                </div>

                <ul className="mt-8 space-y-3.5 text-sm text-muted-foreground border-t border-border pt-6">
                  {[
                    "10 video panjang per hari",
                    "Bebas watermark tanpa syarat",
                    "Fitur Auto-Split multi-speaker",
                    "Prioritas antrean render di server",
                    "Custom Logo & Brand Watermark sendiri",
                    "Ekspor instan dan penyimpanan cloud prioritas",
                  ].map((f) => (
                    <li key={f} className="flex items-center gap-3 text-foreground font-medium">
                      <Check className="size-4 text-accent shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-10">
                <Link
                  to="/auth"
                  className="inline-flex w-full h-11 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-accent-foreground shadow-md shadow-accent/20 transition-transform hover:brightness-105 active:scale-95"
                >
                  <Zap className="size-4" /> Beralih ke Pro
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ FAQ SECTION ═══ */}
      <section id="faq" className="scroll-mt-20 border-t border-border py-24 sm:py-32 bg-surface/40">
        <div className="mx-auto max-w-[1240px] px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.5fr] lg:gap-16">
            <div>
              <h2 className="text-3xl font-display font-extrabold tracking-tight sm:text-4xl text-foreground">
                Pertanyaan yang sering ditanyakan.
              </h2>
              <p className="mt-4 text-base text-muted-foreground leading-relaxed">
                Punya pertanyaan lain seputar workflow atau fitur klip? Hubungi tim kami di{" "}
                <a href="mailto:cs@cortexclip.app" className="font-medium text-foreground underline underline-offset-4 hover:text-accent">
                  cs@cortexclip.app
                </a>
              </p>
            </div>

            <div className="divide-y divide-border border-y border-border">
              {FAQS.map((f, i) => {
                const isOpen = open === i;
                return (
                  <div key={f.q} className="py-5">
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : i)}
                      aria-expanded={isOpen}
                      className="flex w-full items-center justify-between gap-4 text-left transition-colors"
                    >
                      <span className="font-display text-base font-bold text-foreground">{f.q}</span>
                      <ChevronDown
                        className={`size-5 shrink-0 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen ? (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <p className="pt-3 text-sm leading-relaxed text-muted-foreground">
                            {f.a}
                          </p>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
