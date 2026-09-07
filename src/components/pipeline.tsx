import { Link2, Captions, ScanFace, Crown } from "lucide-react";

export function Pipeline() {
  const steps = [
    {
      icon: Link2,
      title: "Tempel & proses",
      desc: "Link YouTube atau file video. Semua pemrosesan berat di awan.",
    },
    {
      icon: Captions,
      title: "AI Analysis",
      desc: "Transkripsi cerdas, penulisan metadata otomatis, dan scoring klip terkuat.",
    },
    {
      icon: ScanFace,
      title: "Render Terpusat",
      desc: "Face tracking mengikuti subjek, render karaoke cepat, hasil siap unduh.",
    },
  ];

  return (
    <section id="cara" className="py-24 sm:py-32 bg-background border-t border-border">
      <div className="mx-auto max-w-[1240px] px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row gap-16 lg:gap-24">
          <div className="lg:w-1/3">
            <h2 className="text-3xl font-display font-extrabold tracking-tight sm:text-4xl text-foreground mb-6">
              Tanpa aplikasi editing.<br />Langsung siap tayang.
            </h2>
            <p className="text-lg leading-relaxed text-muted-foreground mb-10">
              Tidak perlu membuang 2 jam di software video. CortexClip mengubah URL jadi lusinan konten hanya dalam menit.
            </p>
            <div className="p-6 rounded-xl border border-border bg-surface/50">
               <Crown className="size-6 text-accent mb-4" />
               <h4 className="font-display font-bold text-foregrond mb-2">Gratis via Ads</h4>
               <p className="text-sm text-muted-foreground leading-relaxed">
                 Kualitas klip tanpa kompromi. Hanya butuh nonton beberapa iklan untuk render bebas watermark gratis.
               </p>
            </div>
          </div>
          
          <div className="lg:w-2/3">
            <div className="space-y-6">
              {steps.map((s, i) => (
                <div key={s.title} className="flex gap-6 p-6 sm:p-8 rounded-2xl border border-border bg-card">
                  <span className="font-display text-4xl font-extrabold text-border shrink-0">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <h3 className="text-xl font-display font-bold text-foreground mb-2 flex items-center gap-3">
                      <s.icon className="size-5 text-accent" /> {s.title}
                    </h3>
                    <p className="text-muted-foreground leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
