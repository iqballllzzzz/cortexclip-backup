/**
 * Tombol ikon toggle gelap/terang. Satu komponen, dipakai di landing,
 * dashboard, project, dan admin. Bawaan tema: TERANG (disimpan localStorage).
 */
import { useTheme } from "@/hooks/use-theme";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={dark}
      aria-label={dark ? "Ganti ke tema terang" : "Ganti ke tema gelap"}
      title={dark ? "Tema terang" : "Tema gelap"}
      className={`relative grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-surface hover:text-foreground ${className}`}
    >
      {/* cross-fade ikon — hanya transform+opacity (GPU, tanpa layout) */}
      <span
        className="absolute transition-all duration-200"
        style={{
          opacity: dark ? 0 : 1,
          transform: `rotate(${dark ? 45 : 0}deg) scale(${dark ? 0.6 : 1})`,
        }}
      >
        <SunIcon />
      </span>
      <span
        className="absolute transition-all duration-200"
        style={{
          opacity: dark ? 1 : 0,
          transform: `rotate(${dark ? 0 : -45}deg) scale(${dark ? 1 : 0.6})`,
        }}
      >
        <MoonIcon />
      </span>
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}
