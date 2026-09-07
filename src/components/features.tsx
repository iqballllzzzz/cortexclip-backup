import { Captions, Gauge, ScanFace, Sparkles, Youtube, Download } from "lucide-react";

export function Features() {
  const tiles = [
    {
      icon: Captions,
      title: "Karaoke Subtitles",
      desc: "Highlighting per-word otomatis dengan berbagai preset modern bergaya TikTok, YouTube Shorts, dan Reels. Posisi, ukuran, dan transparansi yang fleksibel.",
      span: "sm:col-span-3",
    },
    {
      icon: ScanFace,
      title: "Face Tracking AI",
      desc: "Kamera otomatis melacak pergerakan wajah pembicara untuk menjaganya tetap berada tepat di tengah frame vertikal (9:16) sepanjang waktu.",
      span: "sm:col-span-3",
    },
    {
      icon: Gauge,
      title: "Virality Score",
      desc: "Sistem memberikan skor 0-100 pada setiap klip yang mendeteksi tingkat 'hook' awal untuk membantu memilih momen terkuat terlebih dahulu.",
      span: "sm:col-span-2",
    },
    {
      icon: Youtube,
      title: "Direct YouTube Link",
      desc: "Tidak perlu repot mengunduh video sumber. Tempel link video panjang, server yang mengunduh dan memproses di awan.",
      span: "sm:col-span-2",
    },
    {
      icon: Sparkles,
      title: "Auto Metadata",
      desc: "Tiap klip dibuatkan saran judul pendek, hashtags, dan deskripsi SEO agar lebih mudah menyalin ke platform sosial media.",
      span: "sm:col-span-2",
    },
  ];

  return (
    <section id="fitur" className="py-24 sm:py-32 bg-surface">
      <div className="mx-auto max-w-[1240px] px-6 lg:px-8">
        <div className="max-w-3xl mb-16">
          <h2 className="text-3xl font-display font-extrabold tracking-tight sm:text-5xl text-foreground">
            Lengkap di dalam.<br/>
            Cepat di luar.
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
            CortexClip menghindari editor yang ribet dengan menyertakan seluruh workflow editing: pemotongan AI, subtitle, cropping wajah, dan kompresi tanpa kehilangan kualitas.
          </p>
        </div>

        <div className="grid gap-x-8 gap-y-12 sm:grid-cols-6 border-t border-border pt-12">
          {tiles.map((t) => (
            <div key={t.title} className={t.span}>
              <div className="flex items-center gap-3 mb-4">
                <span className="grid size-10 place-items-center rounded-lg bg-card border border-border">
                  <t.icon className="size-5 text-foreground" />
                </span>
                <h3 className="font-display text-lg font-bold tracking-tight text-foreground">
                  {t.title}
                </h3>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
