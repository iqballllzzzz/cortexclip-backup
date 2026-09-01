import { motion } from "motion/react";
import { Link2, Captions, ScanFace, Gauge, FileVideo, Crown } from "lucide-react";

/**
 * "Cara kerja" — TIGA langkah besar bernomor dalam baris hairline
 * (bukan kartu grid seragam), lalu banding fitur free vs premium
 * dalam dua kolom asimetris.
 */
export function Pipeline() {
  const steps = [
    {
      icon: Link2,
      title: "Tempel & proses",
      desc: "Link YouTube atau file video. Semua berat di server — koneksi kamu cuma untuk kontrol.",
    },
    {
      icon: Captions,
      title: "AI pilih & tulis",
      desc: "Transkripsi kata-per-kata, momen terbaik diberi skor, judul + deskripsi + hashtag jadi otomatis.",
    },
    {
      icon: ScanFace,
      title: "Render & unduh",
      desc: "Framing wajah mengikuti pembicara, caption karaoke terbakar ke video, file siap unggah.",
    },
  ];

  return (
    <section id="cara" className="scroll-mt-24 border-y border-border bg-surface/50">
      <div className="mx-auto max-w-[1180px] px-4 py-20 sm:px-6 sm:py-24">
        <div className="reveal" style={{ ["--i" as string]: 0 }}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
            Cara kerja
          </p>
          <h2 className="mt-3 max-w-xl font-display text-[28px] leading-[1.08] font-bold tracking-tight sm:text-[40px]">
            Tiga langkah. Tanpa aplikasi editing.
          </h2>
        </div>

        <ol className="mt-12 overflow-hidden rounded-2xl border border-border">
          {steps.map((s, i) => (
            <li
              key={s.title}
              className={`reveal grid gap-3 bg-card px-5 py-6 sm:grid-cols-[64px_1fr] sm:items-baseline sm:gap-6 sm:px-7 ${
                i > 0 ? "border-t border-border" : ""
              }`}
              style={{ ["--i" as string]: 1 + i }}
            >
              <span className="stat-figure text-[32px] text-accent/90 sm:text-[40px]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <h3 className="font-display text-lg font-bold tracking-tight">{s.title}</h3>
                <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
                  {s.desc}
                </p>
              </div>
            </li>
          ))}
        </ol>

        {/* free vs premium — banding langsung */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="mt-10 grid gap-3 sm:grid-cols-2"
        >
          <div className="panel px-5 py-5">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <FileVideo className="size-3.5" /> Gratis
            </p>
            <p className="stat-figure mt-3 text-[28px]">2 video / hari</p>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              maks 10 klip per video · caption karaoke penuh · watermark ringan
            </p>
          </div>
          <div className="panel border-accent/40 px-5 py-5">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-accent">
              <Crown className="size-3.5" /> Premium
            </p>
            <p className="stat-figure mt-3 text-[28px]">10 video / hari</p>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              maks 40 klip per video · mulai Rp3.000 · aktif otomatis setelah bayar
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
