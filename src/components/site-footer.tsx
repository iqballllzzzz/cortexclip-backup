import logo from "@/assets/cortexclip-logo.png";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-4">
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
            <span className="font-display text-base font-bold">CortexClip</span>
          </div>
          <p className="mt-3 max-w-sm text-sm text-muted-foreground">
            Mesin auto-clip berbasis AI: satu video panjang jadi puluhan klip vertikal siap unggah,
            lengkap dengan caption karaoke, virality score, dan overlay ikon otomatis.
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold">Produk</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              <a className="hover:text-foreground" href="/#fitur">
                Fitur
              </a>
            </li>
            <li>
              <a className="hover:text-foreground" href="/studio">
                Caption Studio
              </a>
            </li>
            <li>
              <a className="hover:text-foreground" href="/#harga">
                Harga
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold">Dibuat oleh</h3>
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
