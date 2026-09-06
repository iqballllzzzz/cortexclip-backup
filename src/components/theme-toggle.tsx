/**
 * Tombol ikon toggle gelap/terang — kini memakai AnimatedThemeToggler
 * MagicUI (view-transition melingkar dari titik tombol — animasi tema
 * khas MagicUI, "mengalir" dari tombol ke seluruh halaman).
 *
 * Mode CONTROLLED: komponen MagicUI meng-alihkan class .dark pada <html>
 * di dalam snapshot view-transition, lalu memanggil onThemeChange; hook
 * useTheme menyimpan pilihan ke localStorage "cortexclip-theme" dan
 * effect-nya menyetel class ke nilai yang sama (idempotent, tidak dobel).
 */
import { useTheme } from "@/hooks/use-theme";
import { AnimatedThemeToggler } from "@/components/magicui/animated-theme-toggler";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";

  return (
    <AnimatedThemeToggler
      theme={theme}
      onThemeChange={() => toggle()}
      variant="circle"
      duration={450}
      aria-label={dark ? "Ganti ke tema terang" : "Ganti ke tema gelap"}
      title={dark ? "Tema terang" : "Tema gelap"}
      className={`grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface hover:text-foreground [&_svg]:size-[15px] ${className}`}
    />
  );
}
