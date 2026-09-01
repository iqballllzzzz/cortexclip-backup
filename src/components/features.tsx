import { motion } from "motion/react";
import { Captions, Gauge, ScanFace, Sparkles, Youtube, Download } from "lucide-react";

/**
 * Fitur — enam tile dengan LEVAR TIDAK SAMA (grid 6 kolom: 2 tile besar,
 * 4 kecil) supaya tidak jatuh ke pola "3 kartu seragam" khas template.
 */
export function Features() {
  const tiles = [
    {
      icon: Captions,
      title: "Caption karaoke per kata",
      desc: "Kata aktif menyala mengikuti suara — gaya TikTok yang bikin orang selesai nonton. Beberapa preset siap pakai, posisi & ukuran bisa diatur.",
      span: "sm:col-span-4",
      big: true,
    },
    {
      icon: Gauge,
      title: "Skor viralitas",
      desc: "Tiap klip dinilai 0–100 berdasarkan kekuatan hook dan alur cerita.",
      span: "sm:col-span-2",
    },
    {
      icon: ScanFace,
      title: "Face tracking",
      desc: "Kamera otomatis mengikuti pembicara — framing vertikal tetap tepat.",
      span: "sm:col-span-2",
    },
    {
      icon: Youtube,
      title: "Langsung dari link",
      desc: "Tanpa unduh manual: tempel URL YouTube, proses jalan di server.",
      span: "sm:col-span-2",
    },
    {
      icon: Sparkles,
      title: "Metadata otomatis",
      desc: "Judul, deskripsi, dan hashtag ditulis AI untuk tiap klip.",
      span: "sm:col-span-2",
    },
    {
      icon: Download,
      title: "Render latar belakang",
      desc: "Tutup halaman kapan saja — hasil menunggu di halaman unduhan.",
      span: "sm:col-span-6",
    },
  ];

  return (
    <section id="fitur" className="scroll-mt-24">
      <div className="mx-auto max-w-[1180px] px-4 py-20 sm:px-6 sm:py-24">
        <div className="reveal max-w-xl" style={{ ["--i" as string]: 0 }}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
            Fitur
          </p>
          <h2 className="mt-3 font-display text-[28px] leading-[1.08] font-bold tracking-tight sm:text-[40px]">
            Lengkap di dalam, tenang di luar.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
            Semua yang biasanya butuh CapCut, template, dan dua jam editing — dipadatkan jadi satu
            alur otomatis.
          </p>
        </div>

        <div className="mt-12 grid gap-3 sm:grid-cols-6">
          {tiles.map((t, i) => (
            <motion.div
              key={t.title}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: Math.min(0.3, i * 0.05), ease: [0.16, 1, 0.3, 1] }}
              className={`panel px-5 py-5 ${t.span}`}
            >
              <span className="grid size-10 place-items-center rounded-xl bg-accent/10 text-accent">
                <t.icon className="size-5" />
              </span>
              <h3
                className={`mt-4 font-display font-bold tracking-tight ${
                  t.big ? "text-xl" : "text-[15px]"
                }`}
              >
                {t.title}
              </h3>
              <p
                className={`mt-2 leading-relaxed text-muted-foreground ${
                  t.big ? "max-w-lg text-[14px]" : "text-[13px]"
                }`}
              >
                {t.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
