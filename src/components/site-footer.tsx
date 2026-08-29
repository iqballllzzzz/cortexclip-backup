import { Github, Twitter, Youtube } from "lucide-react";
import logo from "@/assets/cortexclip-logo.png";

const cols = [
  {
    title: "Produk",
    links: [
      { label: "Fitur", href: "/#fitur" },
      { label: "Alur Kerja", href: "/#alur" },
      { label: "Studio", href: "/studio" },
      { label: "Harga", href: "/#harga" },
    ],
  },
  {
    title: "Akun",
    links: [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Masuk", href: "/auth" },
      { label: "Daftar", href: "/auth" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:grid-cols-2 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2">
            <img src={logo} alt="Logo CortexClip" loading="lazy" width={24} height={24} className="h-6 w-6 dark:invert" />
            <span className="font-display text-base font-bold tracking-tight">
              Cortex<span className="text-foreground">Clip</span>
            </span>
          </div>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Mesin auto-clip berbasis AI: satu video panjang jadi puluhan klip vertikal siap unggah,
            lengkap dengan caption karaoke dan skor virality.
          </p>
          <div className="mt-5 flex gap-2">
            {[Twitter, Youtube, Github].map((Icon, i) => (
              <a
                key={i}
                href="#"
                aria-label="Sosial media"
                className="flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
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
                  <a className="transition-colors hover:text-foreground" href={l.href}>
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border py-5 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} CortexClip. Dibuat oleh M Iqbal.
      </div>
    </footer>
  );
}
