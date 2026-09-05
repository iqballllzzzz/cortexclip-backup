import { Link } from "@tanstack/react-router";
import { motion, useScroll, useMotionValueEvent } from "motion/react";
import { Menu, X, LayoutDashboard, Sparkles, LogOut } from "lucide-react";
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
    <header
      className={`sticky top-0 z-[var(--z-sticky)] transition-colors duration-200 ${
        scrolled ? "border-b border-border bg-background/92 backdrop-blur-xl" : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-[1180px] items-center gap-6 px-4 sm:px-6">
        <Link to="/" className="flex shrink-0 items-center gap-2">
          <img src="/favicon.png" alt="" className="size-7 object-contain dark:invert" />
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
        <motion.nav
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          className="overflow-hidden border-t border-border bg-background md:hidden"
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
            {user ? (
              <Button asChild variant="accent" size="sm" className="mt-2 w-full">
                <Link to="/dashboard">
                  <LayoutDashboard className="size-3.5" /> Dashboard
                </Link>
              </Button>
            ) : null}
          </div>
        </motion.nav>
      ) : null}
    </header>
  );
}
