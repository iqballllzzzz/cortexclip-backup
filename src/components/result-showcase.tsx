/**
 * BUKTI HASIL NYATA DI LANDING PAGE.
 *
 * Permintaan pengguna: "hapus preview hasil ai nya yang di dashboard, maksudku
 * previewnya itu di landing page bukan di dashboard, jadi hapus yang di
 * dashboard tambahin preview di landing page biar user tau hasilnya dan
 * terbukti juga dan bisa dipercaya."
 *
 * Sumber: GET /api/showcase — klip milik akun ADMIN yang sudah benar-benar
 * dirender (bukan mockup, bukan klip pengguna lain). Kalau endpoint kosong atau
 * gagal, bagian ini TIDAK dirender sama sekali; landing page tetap utuh dan
 * tidak pernah memamerkan kotak kosong.
 *
 * Kinerja: `preload="none"` sampai pengunjung menekan putar, dan hanya SATU
 * video boleh berjalan sekaligus — halaman depan adalah target trafik terbesar.
 */
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Play, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type ShowcaseClip = {
  title: string;
  url: string;
  score: number | null;
  duration: number;
  description: string;
  hashtags: string[];
};

function detik(n: number): string {
  if (!n || n < 1) return "";
  const m = Math.floor(n / 60);
  const s = Math.round(n % 60);
  return m > 0 ? `${m}m ${s}s` : `${s} detik`;
}

export function ResultShowcase() {
  const [clips, setClips] = useState<ShowcaseClip[]>([]);
  const [mainkan, setMainkan] = useState<string | null>(null);

  useEffect(() => {
    let hidup = true;
    fetch("/api/showcase")
      .then((r) => (r.ok ? r.json() : { clips: [] }))
      .then((d: { clips?: ShowcaseClip[] }) => {
        if (hidup) setClips((d.clips ?? []).filter((c) => c.url));
      })
      .catch(() => {
        /* landing page tetap lengkap tanpa bagian ini */
      });
    return () => {
      hidup = false;
    };
  }, []);

  if (clips.length === 0) return null;

  return (
    <section id="hasil-nyata" className="mx-auto max-w-6xl px-5 py-24">
      <div className="max-w-2xl">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-foreground">
          Ini hasil asli dari CortexClip.
        </h2>
        <p className="mt-3 text-muted-foreground leading-relaxed max-w-[65ch]">
          Video di bawah keluar langsung dari pipeline yang sama yang akan
          memproses video kamu — subtitle, framing wajah, dan skor viral apa
          adanya. Tekan untuk memutar.
        </p>
      </div>

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {clips.map((c) => {
          const aktif = mainkan === c.url;
          return (
            <li
              key={c.url}
              className="overflow-hidden rounded-2xl border border-border bg-card"
            >
              <div className="relative aspect-[9/16] w-full bg-black">
                {aktif ? (
                  <video
                    src={c.url}
                    className="size-full object-contain"
                    controls
                    autoPlay
                    playsInline
                    preload="metadata"
                    onEnded={() => setMainkan(null)}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setMainkan(c.url)}
                    className="group grid size-full place-items-center"
                    aria-label={`Putar ${c.title}`}
                  >
                    <video
                      src={c.url}
                      className="absolute inset-0 size-full object-contain opacity-70"
                      preload="none"
                      muted
                      playsInline
                      tabIndex={-1}
                    />
                    <span className="relative grid size-14 place-items-center rounded-full bg-black/70 text-white transition-transform group-hover:scale-105">
                      <Play className="size-6 translate-x-0.5 text-white" />
                    </span>
                  </button>
                )}
              </div>

              <div className="p-3.5">
                <div className="flex items-center justify-between gap-2">
                  {c.duration ? (
                    <span className="text-xs font-mono text-muted-foreground">
                      {detik(c.duration)}
                    </span>
                  ) : (
                    <span />
                  )}
                  {c.score ? (
                    <span className="font-display text-sm font-bold text-accent">
                      {c.score}/100
                    </span>
                  ) : null}
                </div>
                <h3 className="mt-2 text-sm font-semibold tracking-tight">{c.title}</h3>
                {c.description ? (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {c.description}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
