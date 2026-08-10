import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Moon, Sun, Menu, LogOut, LayoutDashboard } from "lucide-react";
import { useState } from "react";
import logo from "@/assets/cortexclip-logo.png";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/hooks/use-auth";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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
  { label: "Alur Kerja", href: "/#alur" },
  { label: "Caption Studio", href: "/studio" },
  { label: "Harga", href: "/#harga" },
  { label: "FAQ", href: "/#faq" },
];

export function SiteHeader() {
  const { theme, toggle } = useTheme();
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);

  async function handleSignOut() {
    await supabase.auth.signOut();
    toast.success("Berhasil keluar.");
  }

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
      className="sticky top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur-xl"
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5">
        <Link to="/" className="flex items-center gap-2">
          <img
            src={logo}
            alt="Logo CortexClip"
            width={32}
            height={32}
            className="h-8 w-8 dark:invert"
          />
          <span className="font-display text-lg font-bold tracking-tight">CortexClip</span>
        </Link>

        <nav className="ml-auto hidden items-center gap-1 md:flex">
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            aria-label="Ganti tema terang atau gelap"
          >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>

          {loading ? null : user ? (
            <>
              <Button asChild variant="accent" className="hidden sm:inline-flex">
                <Link to="/dashboard">
                  <LayoutDashboard className="size-4" /> Dashboard
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full" aria-label="Menu akun">
                    <span className="flex size-7 items-center justify-center rounded-full bg-accent/15 font-display text-sm font-bold text-accent">
                      {(user.email?.charAt(0) ?? "U").toUpperCase()}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium">{user.email}</p>
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
            <Button asChild variant="accent" className="hidden sm:inline-flex">
              <Link to="/auth">Coba Gratis</Link>
            </Button>
          )}

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Buka menu">
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <div className="mt-6 flex flex-col gap-1">
                {nav.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    {item.label}
                  </a>
                ))}
                {user && (
                  <a
                    href="/dashboard"
                    onClick={() => setOpen(false)}
                    className="rounded-md px-3 py-2 text-sm font-medium text-accent transition-colors hover:bg-secondary"
                  >
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
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-500 transition-colors hover:bg-secondary"
                    >
                      <LogOut className="size-4" /> Keluar
                    </button>
                  ) : (
                    <a
                      href="/auth"
                      onClick={() => setOpen(false)}
                      className="flex w-full items-center rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground"
                    >
                      Coba Gratis
                    </a>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </motion.header>
  );
}
