/**
 * I18N CortexClip — 22 bahasa, tanpa dependensi baru.
 *
 * Permintaan pengguna: "tambahin lebih dari 20 bahasa untuk tampilannya…
 * misal pengguna milih bahasa Rusia maka full semua halaman… pakai otomatis
 * deteksi bahasa default browser pengguna."
 *
 * Desain:
 *  - I18nProvider menyimpan pilihan di localStorage (kunci: cc-lang).
 *  - Deteksi awal: localStorage → navigator.language → 'id' (bahasa utama
 *    produk). Deteksi juga memetakan varian (pt-BR → pt, en-GB → en, dst).
 *  - t(kunci) mengembalikan terjemahan bahasa aktif; bila kunci belum ada,
 *    fallback ke bahasa Inggris, lalu ke bahasa Indonesia, lalu ke kuncinya
 *    sendiri. Transkrip/subtitle klip TIDAK disentuh — itu konten video.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { dict as dictID } from "./dict/id";
import { dict as dictEN } from "./dict/en";
import { dict as kamusLain } from "./dict/lain";

export type KodeBahasa =
  | "id" | "en" | "ms" | "jv" | "su" | "th" | "vi" | "tl" | "zh" | "ja"
  | "ko" | "hi" | "bn" | "ur" | "ar" | "tr" | "ru" | "uk" | "de" | "fr"
  | "es" | "pt" | "it" | "nl";

export const BAHASA: { kode: KodeBahasa; nama: string; asli: string }[] = [
  { kode: "id", nama: "Indonesia", asli: "Bahasa Indonesia" },
  { kode: "en", nama: "English", asli: "English" },
  { kode: "ms", nama: "Malaysia", asli: "Bahasa Melayu" },
  { kode: "jv", nama: "Jawa", asli: "Basa Jawa" },
  { kode: "su", nama: "Sunda", asli: "Basa Sunda" },
  { kode: "th", nama: "Thailand", asli: "ไทย" },
  { kode: "vi", nama: "Vietnam", asli: "Tiếng Việt" },
  { kode: "tl", nama: "Filipina", asli: "Tagalog" },
  { kode: "zh", nama: "Mandarin", asli: "中文" },
  { kode: "ja", nama: "Jepang", asli: "日本語" },
  { kode: "ko", nama: "Korea", asli: "한국어" },
  { kode: "hi", nama: "Hindi", asli: "हिन्दी" },
  { kode: "bn", nama: "Bengali", asli: "বাংলা" },
  { kode: "ur", nama: "Urdu", asli: "اردو" },
  { kode: "ar", nama: "Arab", asli: "العربية" },
  { kode: "tr", nama: "Turki", asli: "Türkçe" },
  { kode: "ru", nama: "Rusia", asli: "Русский" },
  { kode: "uk", nama: "Ukraina", asli: "Українська" },
  { kode: "de", nama: "Jerman", asli: "Deutsch" },
  { kode: "fr", nama: "Prancis", asli: "Français" },
  { kode: "es", nama: "Spanyol", asli: "Español" },
  { kode: "pt", nama: "Portugis", asli: "Português" },
  { kode: "it", nama: "Italia", asli: "Italiano" },
  { kode: "nl", nama: "Belanda", asli: "Nederlands" },
];

/** Kamus per bahasa: kunci → teks. EN & ID lengkap; bahasa lain menimpa
 *  yang sudah diterjemahkan dan ber-EN fallback untuk sisanya. */
const KAMUS: Partial<Record<KodeBahasa, Record<string, string>>> = {
  id: dictID,
  en: dictEN,
  ...Object.fromEntries(
    (["ms","jv","su","th","vi","tl","zh","ja","ko","hi","bn","ur","ar","tr",
      "ru","uk","de","fr","es","pt","it","nl"] as const).map((k) => [k, kamusLain[k]]),
  ),
};

const KUNCI_LANG = "cc-lang";

function deteksi(): KodeBahasa {
  try {
    const simpan = localStorage.getItem(KUNCI_LANG) as KodeBahasa | null;
    if (simpan && BAHASA.some((b) => b.kode === simpan)) return simpan;
  } catch { /* SSR / private mode */ }
  const nav = typeof navigator !== "undefined" ? navigator.language : "id";
  const dasar = (nav.split("-")[0] ?? "id").toLowerCase() as KodeBahasa;
  if (BAHASA.some((b) => b.kode === dasar)) return dasar;
  return "id";
}

type I18nCtx = {
  lang: KodeBahasa;
  setLang: (k: KodeBahasa) => void;
  t: (kunci: string, pengganti?: Record<string, string | number>) => string;
};

const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<KodeBahasa>(() => deteksi());

  useEffect(() => {
    try {
      localStorage.setItem(KUNCI_LANG, lang);
    } catch { /* abaikan */ }
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((k: KodeBahasa) => setLangState(k), []);

  const t = useCallback(
    (kunci: string, pengganti?: Record<string, string | number>): string => {
      const kamus = KAMUS[lang] ?? {};
      let teks = kamus[kunci] ?? dictEN[kunci] ?? dictID[kunci] ?? kunci;
      if (pengganti) {
        for (const [k, v] of Object.entries(pengganti)) {
          teks = teks.replaceAll(`{${k}}`, String(v));
        }
      }
      return teks;
    },
    [lang],
  );

  const nilai = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <Ctx.Provider value={nilai}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useI18n harus di dalam I18nProvider");
  return ctx;
}
