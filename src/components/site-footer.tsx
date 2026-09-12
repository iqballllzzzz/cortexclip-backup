import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Github, Twitter, Youtube } from "lucide-react";

const cols = [
  {
    title: "Produk",
    links: [
      { label: "Cara kerja", href: "/#cara" },
      { label: "Fitur", href: "/#fitur" },
      { label: "Harga & QRIS", href: "/#harga" },
      { label: "FAQ", href: "/#faq" },
      { label: "Dashboard", href: "/dashboard" },
    ],
  },
  {
    title: "Panduan & Artikel",
    links: [
      { label: "Dokumentasi Lengkap", href: "/docs" },
      { label: "Panduan Konten Viral", href: "/docs/panduan-konten-viral" },
      { label: "Optimasi Subtitle Karaoke", href: "/docs/optimasi-karaoke-subtitle" },
      { label: "Monetisasi Video Pendek", href: "/docs/monetisasi-video-pendek" },
      { label: "Mulai Cepat 5 Menit", href: "/docs/mulai-cepat" },
    ],
  },
  {
    title: "Legal & Kepatuhan",
    links: [
      { label: "Kebijakan Privasi", href: "/kebijakan-privasi" },
      { label: "Syarat & Ketentuan", href: "/syarat-ketentuan" },
      { label: "Tentang Kami", href: "/tentang-kami" },
      { label: "Hubungi Kami", href: "/kontak" },
      { label: "Keamanan Data", href: "/docs/keamanan" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto grid max-w-[1180px] gap-8 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <div className="flex items-center gap-2">
            <img src="/cortexclip-logo.png" alt="CortexClip" draggable={false} loading="lazy" className="size-6 select-none object-contain" onContextMenu={(e) => e.preventDefault()} />
            <span className="font-display text-base font-bold tracking-tight">CortexClip AI</span>
          </div>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Platform otomatisasi kurasi klip video vertikal AI buatan Indonesia — takarir karaoke akurat, pelacakan wajah cerdas, dan skor viralitas instan.
          </p>
          <div className="mt-5 flex gap-2">
            {[Twitter, Youtube, Github].map((Icon, i) => (
              <a
                key={i}
                href="#"
                aria-label="Sosial media"
                className="grid size-9 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
              >
                <Icon className="size-4" />
              </a>
            ))}
          </div>
        </div>

        {cols.map((c) => (
          <div key={c.title}>
            <h3 className="text-sm font-semibold">{c.title}</h3>
            <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
              {c.links.map((l) => (
                <li key={l.label}>
                  {l.href.startsWith("/#") ? (
                    <a className="transition-colors hover:text-foreground" href={l.href}>
                      {l.label}
                    </a>
                  ) : (
                    <Link className="transition-colors hover:text-foreground" to={l.href}>
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* ═══ TIM PENGEMBANG & KOMUNITAS ═══ */}
      <div className="border-t border-border bg-surface/50 py-8">
        <div className="mx-auto max-w-[1180px] px-4 sm:px-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div>
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-accent">
                Tim Pengembang & Komunitas
              </span>
              <h4 className="font-display text-base font-bold text-foreground mt-0.5">
                Di Balik Layar CortexClip AI
              </h4>
              <p className="text-xs text-muted-foreground mt-1 max-w-[45ch]">
                Infrastruktur pemrosesan klip video AI otomatis karya anak bangsa Indonesia.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              {/* Muhammad Iqbal.S */}
              <a
                href="https://mis-flame.vercel.app"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-accent/40 shadow-sm"
              >
                <div className="size-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center font-bold text-accent text-sm shrink-0">
                  MI
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-foreground group-hover:text-accent transition-colors">
                      Muhammad Iqbal.S
                    </span>
                    <ArrowRight className="size-3 text-muted-foreground group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    Developer (Fullstack Software Engineer)
                  </p>
                  <span className="text-[10px] font-mono text-accent/80 hover:underline">
                    mis-flame.vercel.app ↗
                  </span>
                </div>
              </a>

              {/* SANNN FORUM */}
              <a
                href="https://whatsapp.com/channel/0029Vb6ukqnHQbS4mKP0j80L"
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-emerald-500/40 shadow-sm"
              >
                <div className="size-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center font-bold text-emerald-400 text-sm shrink-0">
                  SF
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-foreground group-hover:text-emerald-400 transition-colors">
                      SANNN FORUM
                    </span>
                    <ArrowRight className="size-3 text-muted-foreground group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    Customer Service & TikTok Marketing
                  </p>
                  <span className="text-[10px] font-mono text-emerald-400/80 hover:underline">
                    Saluran WhatsApp ↗
                  </span>
                </div>
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-border py-5">
        <p className="mx-auto max-w-[1180px] px-4 text-center text-xs text-muted-foreground sm:px-6">
          © {new Date().getFullYear()} CortexClip AI · Dikembangkan oleh Muhammad Iqbal.S (Developer) & SANNN FORUM (Customer Service & TikTok Marketing)
        </p>
      </div>
    </footer>
  );
}

export function FooterCTA() {
  return (
    <section className="border-t border-border">
      <div className="mx-auto grid max-w-[1180px] gap-8 px-4 py-20 sm:px-6 lg:grid-cols-[1.4fr_1fr] lg:items-end">
        <div>
          <h2 className="font-display text-[30px] leading-[1.06] font-bold tracking-tight sm:text-[44px]">
            Video panjang berikutnya
            <br />
            <span className="text-accent">sudah jadi klip.</span>
          </h2>
          <p className="mt-4 max-w-prose text-[15px] leading-relaxed text-muted-foreground">
            Tempel link, tunggu beberapa menit, unduh. Gratis untuk dua video pertama setiap hari.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5 lg:justify-end">
          <Link
            to="/auth"
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-accent-foreground transition-transform hover:-translate-y-0.5"
          >
            Buat akun gratis <ArrowRight className="size-4" />
          </Link>
          <a
            href="/#harga"
            className="inline-flex h-11 items-center rounded-xl border border-border px-6 text-sm font-semibold transition-colors hover:border-accent/50"
          >
            Lihat harga
          </a>
        </div>
      </div>
    </section>
  );
}
