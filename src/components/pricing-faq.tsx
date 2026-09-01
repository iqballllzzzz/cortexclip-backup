import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";

const FAQS = [
  {
    q: "Apakah bisa langsung dari URL YouTube?",
    a: "Bisa. Tempel link videonya, CortexClip mengunduh di server, mentranskrip, dan memilih momen terbaik tanpa kamu unduh manual.",
  },
  {
    q: "Bagaimana virality score dihitung?",
    a: "AI menilai kekuatan hook 3 detik pertama, kejelasan konteks, ketegangan cerita, dan penutup. Skor 85+ layak jadi prioritas unggah.",
  },
  {
    q: "Preview dan hasil unduhan sama?",
    a: "Sama. Preview memakai pipeline yang identik dengan render final — gaya subtitle yang kamu lihat di editor itulah yang terbakar ke video.",
  },
  {
    q: "Bahasa apa saja yang didukung?",
    a: "Bahasa Indonesia, Inggris, dan puluhan bahasa lain — deteksi otomatis dari audio.",
  },
  {
    q: "Bagaimana cara bayar premium?",
    a: "Scan QRIS dari dashboard (semua e-wallet & m-banking). Premium aktif otomatis beberapa detik setelah pembayaran masuk.",
  },
];

/** FAQ accordion ringan — grid-template-rows (bukan height) sesuai disiplin motion. */
export function PricingFaq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="scroll-mt-24 border-t border-border">
      <div className="mx-auto max-w-[1180px] px-4 py-20 sm:px-6 sm:py-24">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.5fr] lg:gap-16">
          <div className="reveal" style={{ ["--i" as string]: 0 }}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">FAQ</p>
            <h2 className="mt-3 font-display text-[28px] leading-[1.08] font-bold tracking-tight sm:text-[40px]">
              Pertanyaan yang sering ditanya.
            </h2>
            <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
              Belum ketemu jawabannya? Hubungi{" "}
              <a href="mailto:cs@cortexclip.app" className="font-medium text-accent underline-offset-2 hover:underline">
                cs@cortexclip.app
              </a>
              .
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border">
            {FAQS.map((f, i) => {
              const isOpen = open === i;
              return (
                <div key={f.q} className={i > 0 ? "border-t border-border" : ""}>
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between gap-4 bg-card px-5 py-4 text-left transition-colors hover:bg-surface/60"
                  >
                    <span className="text-[14px] font-semibold tracking-tight">{f.q}</span>
                    <ChevronDown
                      className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen ? (
                      <motion.div
                        initial={{ gridTemplateRows: "0fr", opacity: 0 }}
                        animate={{ gridTemplateRows: "1fr", opacity: 1 }}
                        exit={{ gridTemplateRows: "0fr", opacity: 0 }}
                        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                        className="grid overflow-hidden"
                      >
                        <div className="min-h-0">
                          <p className="bg-card px-5 pb-4 text-[13px] leading-relaxed text-muted-foreground">
                            {f.a}
                          </p>
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>

        <div className="reveal mt-16" style={{ ["--i" as string]: 1 }}>
          <div className="panel flex flex-col items-start justify-between gap-5 px-6 py-7 sm:flex-row sm:items-center sm:px-8">
            <div>
              <h3 className="font-display text-xl font-bold tracking-tight sm:text-2xl">
                Video panjang berikutnya, sudah jadi klip.
              </h3>
              <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
                Tempel link, tunggu beberapa menit, unduh. Gratis untuk dua video pertama setiap hari.
              </p>
            </div>
            <Link
              to="/auth"
              className="inline-flex h-11 shrink-0 items-center rounded-xl bg-accent px-6 text-sm font-semibold text-accent-foreground transition-transform hover:-translate-y-0.5"
            >
              Buat akun gratis
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
