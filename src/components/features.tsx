import { motion } from "motion/react";
import {
  Blend,
  Braces,
  Captions,
  CalendarClock,
  Eraser,
  Focus,
  Gauge,
  Languages,
  LayoutTemplate,
  Palette,
  Scissors,
  Shapes,
  Users,
  Film,
  Sparkles,
} from "lucide-react";

const features = [
  {
    icon: Scissors,
    title: "AI Curation & Repurposing",
    body: "Satu klik memecah podcast atau webinar panjang jadi 10+ klip pendek siap unggah.",
    large: true,
  },
  {
    icon: Gauge,
    title: "Curated Virality Score",
    body: "Skor 0-100 dari analisis hook, konteks, dan struktur cerita tiap potongan.",
    large: true,
  },
  {
    icon: Captions,
    title: "Caption karaoke dinamis",
    body: "Kata menyala tepat saat diucapkan, dengan pop-up, stroke tebal, dan warna kontras.",
  },
  {
    icon: Focus,
    title: "AI face tracking 9:16",
    body: "Wajah pembicara selalu terkunci di tengah bingkai vertikal.",
  },
  {
    icon: Film,
    title: "B-roll & transisi otomatis",
    body: "Stok visual relevan disisipkan saat pembicara menyebut objek penting.",
  },
  {
    icon: Shapes,
    title: "Overlay ikon kontekstual",
    body: "Ikon jam, grafik, koin, atau tanda seru muncul otomatis.",
  },
  {
    icon: Eraser,
    title: "Filler word removal",
    body: "“ehm”, “aaa”, dan jeda canggung dipangkas supaya ritme tetap padat.",
  },
  {
    icon: Blend,
    title: "Gold nugget blending",
    body: "Kalimat di menit ke-2 disambung mulus dengan penguat di menit ke-10.",
  },
  {
    icon: Palette,
    title: "Brand kit & template",
    body: "Kunci font, warna, logo, intro/outro sekali — semua render berikutnya otomatis ikut.",
  },
  {
    icon: LayoutTemplate,
    title: "Split screen layout",
    body: "Deteksi gameplay atau footage estetik untuk layout stack atas-bawah.",
  },
  {
    icon: Languages,
    title: "Terjemahan caption",
    body: "Duplikat jalur teks ke bahasa lain untuk menjangkau audiens global.",
  },
  {
    icon: CalendarClock,
    title: "Auto-post & scheduler",
    body: "Jadwalkan langsung ke TikTok, Shorts, dan Reels dari satu dasbor.",
  },
  {
    icon: Braces,
    title: "Export XML & API",
    body: "Timeline utuh ke Premiere Pro / DaVinci, plus REST API untuk integrasi internal.",
  },
  {
    icon: Users,
    title: "Team workspace",
    body: "Folder proyek, hak akses editor/manajer/klien, dan komentar langsung di dasbor.",
  },
];

export function Features() {
  return (
    <section id="fitur" className="relative mx-auto max-w-6xl scroll-mt-20 px-5 py-24">
      {/* subtle background glow */}
      <div className="pointer-events-none absolute right-0 top-20 size-80 rounded-full bg-accent/5 blur-3xl" aria-hidden="true" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5 }}
        className="max-w-2xl"
      >
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          <Sparkles className="size-3.5" /> Fitur
        </p>
        <h2 className="mt-3 text-3xl font-bold sm:text-4xl">
          Semua yang dipunya editor tim besar,{" "}
          <span className="text-gradient-amber">dalam satu dasbor.</span>
        </h2>
        <p className="mt-3 text-muted-foreground">
          Dibangun untuk kreator solo maupun agensi. Setiap fitur bisa dimatikan per-proyek supaya
          klip komedi tetap bersih dan klip edukasi tetap kaya visual.
        </p>
      </motion.div>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f, i) => (
          <motion.article
            key={f.title}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.45, delay: (i % 3) * 0.06 }}
            className={`group relative overflow-hidden rounded-2xl border border-border bg-card p-5 card-hover-lift ${
              f.large ? "sm:col-span-2 lg:col-span-1 lg:row-span-1" : ""
            }`}
          >
            {/* hover glow */}
            <div className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full bg-accent/0 blur-2xl transition-all duration-300 group-hover:bg-accent/15" aria-hidden="true" />

            <div className="relative flex size-11 items-center justify-center rounded-xl bg-accent/10 text-accent transition-all duration-300 group-hover:scale-110 group-hover:bg-accent group-hover:text-accent-foreground">
              <f.icon className="size-5" />
            </div>
            <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.body}</p>

            {/* bottom shine on hover */}
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-accent/0 to-transparent transition-all duration-300 group-hover:via-accent/60" aria-hidden="true" />
          </motion.article>
        ))}
      </div>
    </section>
  );
}