import { Github, Instagram, Twitter, Youtube } from "lucide-react";
import logo from "@/assets/cortexclip-logo.png";

const productLinks = [
  { label: "Fitur", href: "/#fitur" },
  { label: "Alur Kerja", href: "/#alur" },
  { label: "Caption Studio", href: "/studio" },
  { label: "Harga", href: "/#harga" },
  { label: "FAQ", href: "/#faq" },
];

const resourceLinks = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Masuk", href: "/auth" },
  { label: "Daftar", href: "/auth" },
];

const socials = [
  { icon: Twitter, label: "Twitter", href: "#" },
  { icon: Instagram, label: "Instagram", href: "#" },
  { icon: Youtube, label: "YouTube", href: "#" },
  { icon: Github, label: "GitHub", href: "#" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface/60">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2">
            <img
              src={logo}
              alt="Logo CortexClip"
              loading="lazy"
              width={28}
              height={28}
              className="h-7 w-7 dark:invert"
            />
            <span className="font-display text-base font-bold">
              Cortex<span className="text-gradient-amber">Clip</span>
            </span>
          </div>
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">
            Mesin auto-clip berbasis AI: satu video panjang jadi puluhan klip vertikal siap unggah,
            lengkap dengan caption karaoke, virality score, dan overlay ikon otomatis.
          </p>
          <div className="mt-5 flex gap-2">
            {socials.map((s) => (
              <a
                key={s.label}
                href={s.href}
                aria-label={s.label}
                className="flex size-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-all hover:border-accent hover:bg-accent hover:text-accent-foreground"
              >
                <s.icon className="size-4" />
              </a>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold">Produk</h3>
          <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
            {productLinks.map((l) => (
              <li key={l.label}>
                <a className="transition-colors hover:text-accent" href={l.href}>
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold">Akun</h3>
          <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
            {resourceLinks.map((l) => (
              <li key={l.label}>
                <a className="transition-colors hover:text-accent" href={l.href}>
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          <h3 className="mt-6 text-sm font-semibold">Dibuat oleh</h3>
          <p className="mt-3 text-sm text-muted-foreground">
            M Iqbal — solo fullstack developer & AI enthusiast, Jakarta, Indonesia.
          </p>
        </div>
      </div>
      <div className="border-t border-border py-5 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} CortexClip. Semua hak dilindungi.
      </div>
    </footer>
  );
}