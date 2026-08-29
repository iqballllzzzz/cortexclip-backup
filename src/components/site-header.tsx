import { Link } from "@tanstack/react-router";
import { motion, useScroll, useMotionValueEvent } from "motion/react";
import { Sun, Menu, LogOut, LayoutDashboard, Sparkles } from "lucide-react";
import { useState } from "react";
import logo from "@/assets/cortexclip-logo.png";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/hooks/use-auth";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const nav = [
  { label: "Fitur", href: "/#fitur" },
  { label: "Studio", href: "/studio" },
  { label: "Harga", href: "/#harga" },
  { label: "FAQ", href: "/#faq" },
];

export function SiteHeader() {
  const { theme, toggle } = useTheme();
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (latest) => setScrolled(latest > 16));

  async function handleSignOut() {
    await supabase.auth.signOut();
    toast.success("Berhasil keluar.");
  }

  return (
    <header className="fixed inset-x-0 top-4 z-50 px-4">
      <motion.div
        initial={{ y: -16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
        className={`mx-auto flex h-14 max-w-5xl items-center gap-2 rounded-full px-3 transition-all duration-300 ${
          scrolled
            ? "glass shadow-lg"
            : "bg-background/40 backdrop-blur-md border border-transparent"
        }`}
      >
        <Link to="/" className="flex shrink-0 items-center gap-2 px-2">
          <img src={logo} alt="Logo CortexClip" width={26} height={26} className="h-6 w-6 dark:invert" />
          <span className="font-display text-[15px] font-bold tracking-tight">
            Cortex<span className="text-foreground">Clip</span>
          </span>
        </Link>

        <nav className="ml-auto hidden items-center gap-1 md:flex">
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-full px-3.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5 md:ml-0">
          <Button variant="ghost" size="icon" onClick={toggle} aria-label="Ganti tema" className="h-9 w-9 rounded-full">
            {theme === "dark" ? <Sun className="size-4" /> : <Sun className="size-4 opacity-60" />}
          </Button>

          {loading ? null : user ? (
            <>
              <Button asChild variant="accent" className="hidden h-9 rounded-full px-4 sm:inline-flex">
                <Link to="/dashboard">
                  <LayoutDashboard className="size-3.5" /> Dashboard
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-9 w-9 rounded-full p-0" aria-label="Menu akun">
                    <span className="flex size-7 items-center justify-center rounded-full bg-accent text-[13px] font-bold text-accent-foreground">
                      {(user.email?.charAt(0) ?? "U").toUpperCase()}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 py-1.5">
                    <p className="truncate text-sm font-medium">{user.email}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/dashboard">
                      <LayoutDashboard className="mr-2 size-4" /> Dashboard
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="text-red-500 focus:text-red-500">
                    <LogOut className="mr-2 size-4" /> Keluar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Button asChild variant="accent" className="hidden h-9 rounded-full px-4 sm:inline-flex">
              <Link to="/auth">
                <Sparkles className="size-3.5" /> Coba Gratis
              </Link>
            </Button>
          )}

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" className="h-9 w-9 rounded-full p-0 md:hidden" aria-label="Buka menu">
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <div className="mt-4 flex flex-col gap-1">
                {nav.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    {item.label}
                  </a>
                ))}
                {user && (
                  <a href="/dashboard" onClick={() => setOpen(false)} className="rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary">
                    Dashboard
                  </a>
                )}
                <div className="mt-2 border-t border-border pt-2">
                  {user ? (
                    <button
                      onClick={() => {
                        setOpen(false);
                        handleSignOut();
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-500 hover:bg-secondary"
                    >
                      <LogOut className="size-4" /> Keluar
                    </button>
                  ) : (
                    <a href="/auth" onClick={() => setOpen(false)} className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground">
                      <Sparkles className="size-4" /> Coba Gratis
                    </a>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </motion.div>
    </header>
  );
}
