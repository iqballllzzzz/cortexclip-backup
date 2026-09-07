import { Link } from "@tanstack/react-router";
import { motion, useScroll, useMotionValueEvent } from "motion/react";
import { Menu, X, LayoutDashboard, Sparkles, LogOut, ArrowRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const nav = [
  { label: "Cara kerja", href: "/#cara" },
  { label: "Fitur", href: "/#fitur" },
  { label: "Harga", href: "/#harga" },
  { label: "Docs", href: "/docs" },
  { label: "FAQ", href: "/#faq" },
];

/**
 * Navigasi landing: BARIS biasa sticky (bukan kapsul melayang), hairline
 * saat scroll, toggle tema terang/gelap, CTA tunggal di kanan.
 */
export function SiteHeader() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (v) => setScrolled(v > 8));

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Berhasil keluar.");
  }

  return (
    <>
      {/* ═══ BARIS PENGUMUMAN GRUP WHATSAPP OFFICIAL ═══ */}
      <div className="relative z-50 border-b border-white/10 bg-black/80 px-4 py-2 text-center text-xs font-mono select-none backdrop-blur-md">
        <div className="mx-auto flex max-w-[1180px] items-center justify-center gap-2">
          <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-white/80">Komunitas Kreator:</span>
          <a
            href="https://chat.whatsapp.com/EQBUHFIuOTG4ziEGLWhZG5"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-emerald-400 hover:text-emerald-300 hover:underline transition-colors"
          >
            <span>Join Grup WhatsApp Official CortexClip AI</span>
            <ArrowRight className="size-3" />
          </a>
        </div>
      </div>

      <header
        className={`sticky top-0 z-[var(--z-sticky)] transition-colors duration-200 ${
          scrolled ? "border-b border-border bg-background/92 backdrop-blur-xl" : "bg-transparent"
        }`}
      >
      <div className="mx-auto flex h-16 max-w-[1180px] items-center gap-6 px-4 sm:px-6">
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2"
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* Logo BERWARNA asli — TANPA dark:invert (keluhan: "logo gak
              terlihat di tema gelap" karena invert membuat warna kuda jadi
              negatif). PNG RGBA berwarna terbaca baik di terang & gelap. */}
          <img
            src="/cortexclip-logo.png"
            alt="CortexClip"
            draggable={false}
            className="size-8 select-none object-contain"
            onContextMenu={(e) => e.preventDefault()}
          />
          <span className="font-display text-[15px] font-bold tracking-tight">CortexClip</span>
        </Link>

        <nav className="hidden items-center gap-0.5 md:flex">
          {nav.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
            >
              {n.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          {loading ? null : user ? (
            <>
              <Button asChild variant="accent" size="sm" className="hidden sm:inline-flex">
                <Link to="/dashboard">
                  <LayoutDashboard className="size-3.5" /> Dashboard
                </Link>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void signOut()} className="hidden md:inline-flex">
                <LogOut className="size-3.5" /> Keluar
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
                <Link to="/auth">Masuk</Link>
              </Button>
              <Button asChild variant="accent" size="sm">
                <Link to="/auth">
                  <Sparkles className="size-3.5" /> Mulai gratis
                </Link>
              </Button>
            </>
          )}
          <button
            onClick={() => setOpen((v) => !v)}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface hover:text-foreground md:hidden"
            aria-label="Menu"
            aria-expanded={open}
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>

      {open ? (
        <nav
          className="border-t border-border bg-background md:hidden animate-in fade-in duration-150"
        >
          <div className="mx-auto max-w-[1180px] px-4 py-3">
            {nav.map((n) => (
              <a
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-2 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
              >
                {n.label}
              </a>
            ))}
            <a
              href="https://wa.me/6285183317385"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="mt-1 flex items-center gap-2 rounded-lg px-2 py-2.5 text-sm font-semibold text-emerald-400 hover:bg-surface transition-colors"
            >
              <span>Hubungi Customer Service</span>
            </a>
            {user ? (
              <Button asChild variant="accent" size="sm" className="mt-2 w-full">
                <Link to="/dashboard">
                  <LayoutDashboard className="size-3.5" /> Dashboard
                </Link>
              </Button>
            ) : null}
          </div>
        </nav>
      ) : null}
    </header>
    </>
  );
}
