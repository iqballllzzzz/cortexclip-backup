import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { BookOpen, Crown, Download, LayoutDashboard, LogOut, Menu, Send, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Navigasi aplikasi (area login). Sticky, tipis, hairline — bukan kapsul glass
 * melayang seperti versi lama. Menyimpan satu CTA aksi (Upgrade) di kanan.
 */
export function AppNav({
  displayName,
  avatarUrl,
  isAdmin,
  plan,
  onUpgrade,
  right,
  themeToggle,
}: {
  displayName: string;
  avatarUrl?: string | null | undefined;
  isAdmin?: boolean | undefined;
  plan?: string | undefined;
  onUpgrade?: (() => void) | undefined;
  right?: React.ReactNode;
  themeToggle?: boolean | undefined;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Berhasil keluar.");
    navigate({ to: "/", replace: true });
  }

  const links = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/unduh", label: "Unduhan", icon: Download },
    { to: "/social", label: "Auto Publishing", icon: Send },
    { to: "/docs", label: "Panduan", icon: BookOpen },
    ...(isAdmin ? [{ to: "/admin", label: "Admin", icon: ShieldCheck }] : []),
  ] as const;

  return (
    <header className="sticky top-0 z-[var(--z-sticky)] border-b border-border bg-background/88 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1180px] items-center gap-4 px-4 py-3 sm:px-6">
        <Link to="/dashboard" className="flex min-w-0 items-center gap-2">
          <img src="/favicon.png" alt="" className="size-7 shrink-0 object-contain" />
          <span className="truncate font-display text-[15px] font-bold tracking-tight">
            CortexClip
          </span>
        </Link>

        <nav className="ml-3 hidden items-center gap-0.5 md:flex">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-foreground [&.active]:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {themeToggle ? <ThemeToggle /> : null}
          {right}
          {plan !== "premium" && onUpgrade ? (
            <Button size="sm" variant="accent" onClick={onUpgrade} className="hidden sm:inline-flex">
              <Crown className="size-3.5" /> Upgrade
            </Button>
          ) : plan === "premium" ? (
            <span className="hidden items-center gap-1.5 rounded-full border border-accent/25 bg-accent/8 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent sm:inline-flex">
              <Crown className="size-3" /> Premium
            </span>
          ) : null}

          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="size-8 rounded-full border border-border object-cover" />
          ) : (
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent/12 text-[13px] font-bold text-accent">
              {displayName.charAt(0).toUpperCase()}
            </span>
          )}

          <button
            onClick={() => void signOut()}
            className="hidden size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface hover:text-foreground md:grid"
            title="Keluar"
            aria-label="Keluar"
          >
            <LogOut className="size-4" />
          </button>

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

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden border-t border-border md:hidden"
          >
            <div className="mx-auto max-w-[1180px] px-4 py-3">
              {links.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
                >
                  <l.icon className="size-4" /> {l.label}
                </Link>
              ))}
              {plan !== "premium" && onUpgrade ? (
                <Button
                  variant="accent"
                  size="sm"
                  className="mt-2 w-full"
                  onClick={() => {
                    setOpen(false);
                    onUpgrade();
                  }}
                >
                  <Crown className="size-3.5" /> Upgrade Premium
                </Button>
              ) : null}
              <button
                onClick={() => void signOut()}
                className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-2 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
              >
                <LogOut className="size-4" /> Keluar
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
