import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "cortexclip-theme";

export type Theme = "light" | "dark";

function readInitial(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
  if (stored === "light" || stored === "dark") return stored;
  return "dark"; // bawaan GELAP (Cinema Dark Studio)
}

/** Tema global: bawaan gelap, pilihan disimpan, kelas .dark di <html>. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readInitial);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);

  return { theme, toggle };
}
