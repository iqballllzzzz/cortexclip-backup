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
            <p className="mt-4 text-lg text-muted-foreground max-w-[55ch] mx-auto">
              Mulai gratis atau beralih ke Creator Pro untuk fitur penuh tanpa watermark.
            </p>
          </div>

          {/* Comparison Breakdown: OpusClip vs CortexClip */}
          <div className="mb-16 rounded-2xl border border-border bg-card overflow-hidden">
            <div className="p-5 border-b border-border bg-surface">
              <h3 className="font-display text-base font-bold text-foreground">
                Perbandingan Langsung: CortexClip vs OpusClip
              </h3>
            </div>
            <div className="divide-y divide-border text-sm">
              <div className="grid grid-cols-3 p-4 font-semibold text-muted-foreground bg-surface/50 text-xs tracking-wide">
                <span>Kapasitas</span>
                <span>OpusClip Luar</span>
                <span className="text-accent font-bold">CortexClip AI</span>
              </div>
              <div className="grid grid-cols-3 p-4 items-center">
                <span className="font-medium text-foreground">Biaya Langganan</span>
                <span className="text-muted-foreground">$19 / bln (~Rp310.000)</span>
                <span className="font-bold text-accent">Rp70.000 / bln (QRIS)</span>
              </div>
              <div className="grid grid-cols-3 p-4 items-center">
                <span className="font-medium text-foreground">Batasan Menit</span>
                <span className="text-muted-foreground">150 menit kredit hangus</span>
                <span className="font-bold text-accent">10 video panjang / hari</span>
              </div>
              <div className="grid grid-cols-3 p-4 items-center">
                <span className="font-medium text-foreground">Akurasi Kata Indo</span>
                <span className="text-muted-foreground">Standar generic model</span>
                <span className="font-bold text-accent">Whisper Alignment 99.8%</span>
              </div>
              <div className="grid grid-cols-3 p-4 items-center">
                <span className="font-medium text-foreground">Akses Gratis</span>
                <span className="text-muted-foreground">Trial 1 kali lalu terkunci</span>
                <span className="font-bold text-accent">Bisa gratis via Reward Ads</span>
              </div>
            </div>
          </div>

          <div className="mx-auto grid max-w-lg grid-cols-1 gap-8 lg:max-w-4xl lg:grid-cols-2">
            {/* Free Plan */}
            <div className="rounded-3xl border border-border bg-card p-8 sm:p-10 flex flex-col justify-between relative">
              <div>
                <div className="flex items-center justify-between gap-4">
                  <h3 className="font-display text-xl font-bold text-foreground">Gratis</h3>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
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
                  className="inline-flex w-full py-3 items-center justify-center rounded-lg bg-surface text-sm font-semibold text-foreground transition-colors hover:bg-surface/80 active:scale-98"
                >
                  Mulai Sekarang
                </Link>
              </div>
            </div>

            {/* Pro Plan -> PREMIUM */}
            <div className="rounded-3xl border-2 border-accent bg-card p-8 sm:p-10 flex flex-col justify-between relative shadow-sm">
              <div>
                <div className="flex items-center justify-between gap-4">
                  <h3 className="font-display text-xl font-bold text-foreground">Premium</h3>
                  <span className="text-xs font-bold text-accent uppercase tracking-wider">
                    QRIS Seluruh E-Wallet
                  </span>
                </div>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                  Akses instan tanpa komitmen panjang. Pilih paket harian atau bulanan sesuai kebutuhan produksimu.
                </p>
                <div className="mt-6 flex items-baseline gap-2">
                  <span className="font-display text-4xl font-extrabold text-foreground">Rp70.000</span>
                  <span className="text-sm text-muted-foreground">/ bulan</span>
                  <span className="text-xs font-mono text-accent font-semibold ml-2">atau mulai Rp3.000/hari</span>
                </div>

                {/* Pricing Tiers Pills */}
                <div className="mt-4 flex flex-wrap gap-2 text-xs font-mono">
                  <span className="px-2 py-1 rounded bg-surface border border-border text-foreground">1 Hari: Rp3rb</span>
                  <span className="px-2 py-1 rounded bg-surface border border-border text-foreground">5 Hari: Rp10rb</span>
                  <span className="px-2 py-1 rounded bg-accent/15 border border-accent/30 text-accent font-bold">1 Bulan: Rp70rb</span>
                  <span className="px-2 py-1 rounded bg-surface border border-border text-foreground">1 Tahun: Rp215rb</span>
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
                  className="inline-flex w-full py-3 items-center justify-center gap-2 rounded-lg bg-accent text-sm font-semibold text-accent-foreground transition-colors hover:opacity-90 active:scale-98"
                >
                  <Zap className="size-4" /> Dapatkan Akses Premium
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ FAQ SECTION ═══ */}
      <section id="faq" className="scroll-mt-20 border-t border-border py-24 sm:py-32 bg-surface">
        <div className="mx-auto max-w-[1240px] px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.5fr] lg:gap-16">
            <div>
              <h2 className="text-3xl font-display font-extrabold tracking-tight sm:text-4xl text-foreground">
                Pertanyaan yang sering ditanyakan.
              </h2>
              <p className="mt-4 text-base text-muted-foreground leading-relaxed max-w-[38ch]">
                Punya pertanyaan lain seputar workflow atau fitur klip? Hubungi tim kami di{" "}
                <a href="mailto:cs@cortexclip.app" className="font-medium text-foreground underline underline-offset-4 hover:text-accent">
                  cs@cortexclip.app
                </a>
              </p>
            </div>

            <div className="divide-y divide-border border-y border-border max-w-[550px]">
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
                    <div
                      className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                        isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                      }`}
                    >
                      <div className="overflow-hidden">
                        <p className="pt-3 text-sm leading-relaxed text-muted-foreground max-w-[65ch]">
                          {f.a}
                        </p>
                      </div>
                    </div>
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
