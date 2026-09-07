import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Play, Check } from "lucide-react";

type KlipHero = {
  title: string;
  url: string;
  score: number | null;
  duration: number;
};

export function Hero() {
  const [klip, setKlip] = useState<KlipHero | null>(null);
  const [jalan, setJalan] = useState(false);

  useEffect(() => {
    let hidup = true;
    fetch("/api/showcase")
      .then((r) => (r.ok ? r.json() : { clips: [] }))
      .then((d: { clips?: KlipHero[] }) => {
        if (hidup) setKlip((d.clips ?? []).find((c) => c.url) ?? null);
      })
      .catch(() => {});
    return () => { hidup = false; };
  }, []);

  return (
    <section className="relative overflow-hidden bg-background pt-24 pb-20 sm:pt-32 sm:pb-28">
      {/* Impeccable Style: No AI Slop gradients, no glassmorphism orb drops. purely structured. */}
      
      <div className="mx-auto max-w-[1240px] px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-16">
          <div className="max-w-2xl lg:w-1/2">
            <div className="inline-flex flex-wrap items-center gap-3 mb-6">
               <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                 <Check className="size-3 text-accent" /> Bahasa Indonesia
               </span>
               <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                 Premium Gratis via Iklan
               </span>
            </div>
            
            <h1 className="font-display text-[44px] sm:text-[68px] leading-[1.05] font-extrabold tracking-tight text-foreground">
              Turn long videos into <span className="text-accent">viral clips.</span>
            </h1>
            
            <p className="mt-6 text-lg sm:text-lg leading-relaxed text-muted-foreground max-w-prose">
              CortexClip extracts the most engaging moments from your podcasts, webinars, or raw footage and turns them into ready-to-publish vertical clips with karaoke subtitles, face tracking, and AI-driven scores.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-4">
              <Link
                to="/auth"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-foreground px-8 text-[15px] font-semibold text-background transition-transform active:scale-95 hover:bg-neutral-800 dark:hover:bg-neutral-200"
              >
                Mulai Gratis <ArrowRight className="size-4" />
              </Link>
              <a
                href="/#cara"
                className="inline-flex h-12 items-center justify-center rounded-lg border border-border bg-background px-8 text-[15px] font-semibold text-foreground transition-colors hover:border-foreground active:scale-95"
              >
                Lihat Contoh
              </a>
            </div>

            <p className="mt-6 flex items-center gap-4 text-xs font-medium text-muted-foreground uppercase tracking-widest">
              <span>Zero CC required</span>
              <span>•</span>
              <span>Fast Render</span>
            </p>
          </div>

          <div className="lg:w-[400px] shrink-0 relative flex justify-center">
            {/* Minimalist Phone Wireframe showing the showcase video */}
            <div className="relative w-[300px] h-[533px] bg-card rounded-[2rem] border border-border shadow-2xl overflow-hidden p-2">
              <div className="w-full h-full relative rounded-[1.5rem] bg-black overflow-hidden group">
                {klip?.url ? (
                  <>
                    <video
                      src={klip.url}
                      className="absolute inset-0 w-full h-full object-cover"
                      playsInline
                      muted={false}
                      loop
                      controls={false}
                      preload="none"
                      onClick={(e) => {
                        const v = e.currentTarget;
                        if (v.paused) {
                           v.play();
                           setJalan(true);
                        } else {
                           v.pause();
                           setJalan(false);
                        }
                      }}
                    />
                    {!jalan && (
                      <div className="absolute inset-0 grid place-items-center bg-black/40 pointer-events-none transition-opacity group-hover:bg-black/20">
                        <span className="grid size-14 place-items-center bg-white/20 backdrop-blur-md rounded-full text-white">
                          <Play className="size-6 translate-x-0.5 fill-white" />
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="w-full h-full bg-surface grid place-items-center p-6 text-center text-sm text-muted-foreground border border-border/50">
                    Sistem otomatis merender klip
                  </div>
                )}
              </div>
            </div>
            
            {/* Floating feature badge (impeccable minimal) */}
            <div className="absolute bottom-6 -right-6 lg:-right-10 bg-card border border-border shadow-lg rounded-xl p-4 w-[200px] hidden sm:block">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Virality Score</p>
              <div className="flex items-end gap-2">
                <span className="text-4xl font-display font-extrabold leading-none text-accent">94</span>
                <span className="text-sm font-medium text-muted-foreground mb-1">/ 100</span>
              </div>
              <div className="mt-3 h-1.5 w-full bg-border rounded-full overflow-hidden">
                <div className="h-full bg-accent w-[94%] relative"></div>
              </div>
            </div>
            
          </div>
        </div>
      </div>
    </section>
  );
}
