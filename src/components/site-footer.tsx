import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Github, Twitter, Youtube } from "lucide-react";

const cols = [
  {
    title: "Produk",
    links: [
      { label: "Cara kerja", href: "/#cara" },
      { label: "Fitur", href: "/#fitur" },
      { label: "Harga", href: "/#harga" },
      { label: "FAQ", href: "/#faq" },
    ],
  },
  {
    title: "Bantuan",
    links: [
      { label: "Dokumentasi", href: "/docs" },
      { label: "Cara pakai", href: "/docs#mulai" },
      { label: "Batas & harga", href: "/docs#batas" },
      { label: "Masalah umum", href: "/docs#masalah" },
    ],
  },
  {
    title: "Akun",
    links: [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Masuk", href: "/auth" },
      { label: "Unduhan", href: "/unduh" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto grid max-w-[1180px] gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2">
            <img src="/favicon.png" alt="" loading="lazy" className="size-6 object-contain" />
            <span className="font-display text-base font-bold tracking-tight">CortexClip</span>
          </div>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Satu video panjang, puluhan klip vertikal siap unggah — caption karaoke, skor
            viralitas, dan face tracking otomatis.
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
      <div className="border-t border-border py-5">
        <p className="mx-auto max-w-[1180px] px-4 text-center text-xs text-muted-foreground sm:px-6">
          © {new Date().getFullYear()} CortexClip · Dibuat oleh M Iqbal
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
