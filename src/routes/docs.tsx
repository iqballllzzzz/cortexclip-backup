import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { DocsIntro } from "@/components/docs/docs-intro";
import { DocsFeatures } from "@/components/docs/docs-features";
import { DocsLimits } from "@/components/docs/docs-limits";
import { DocsHelp } from "@/components/docs/docs-help";
import { SITE_URL, breadcrumbLd, faqLd, ldScript } from "@/lib/seo-jsonld";

const title = "Dokumentasi CortexClip AI — Panduan Lengkap Fitur, Batas & Cara Pakai";
const description =
  "Panduan lengkap CortexClip AI: cara pakai dari nol, penjelasan tiap fitur (subtitle karaoke, face tracking, ikon, b-roll), batas pemakaian, harga premium, perkiraan lama proses, dan solusi masalah umum.";

const DOCS_FAQ = [
  {
    q: "Apakah preview di editor sama dengan hasil unduhan?",
    a: "Ya. Ukuran font, posisi subtitle, ikon, emoji, dan b-roll memakai rumus dan berkas yang sama. Ikon di preview diambil dari server — berkas yang sama yang dibakar ke video.",
  },
  {
    q: "Berapa panjang maksimal video yang bisa diproses CortexClip?",
    a: "Tidak ada batas keras. Video berjam-jam ditangani dengan memecah audio dan menilai transkrip secara bertahap.",
  },
  {
    q: "Berapa lama proses video 1 jam?",
    a: "Sekitar 4-7 menit sampai klip siap. Render satu klip untuk diunduh rata-rata 150 detik.",
  },
  {
    q: "Berapa harga premium CortexClip?",
    a: "Rp3.000 untuk 1 hari, Rp8.000 untuk 5 hari, Rp25.000 untuk 1 bulan, dan Rp210.000 untuk 1 tahun. Pembayaran lewat QRIS.",
  },
];

const TOC = [
  { id: "apa-itu", label: "Apa itu CortexClip" },
  { id: "mulai", label: "Cara pakai" },
  { id: "alur", label: "Alur teknis" },
  { id: "fitur", label: "Fitur satu per satu" },
  { id: "batas", label: "Batas & peraturan" },
  { id: "lama", label: "Perkiraan lama proses" },
  { id: "tips", label: "Tips hasil bagus" },
  { id: "masalah", label: "Masalah umum" },
  { id: "faq", label: "FAQ" },
];

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "article" },
      { property: "og:url", content: `${SITE_URL}/docs` },
      { property: "og:site_name", content: "CortexClip" },
      { property: "og:locale", content: "id_ID" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/docs` }],
    scripts: [
      ldScript(
        breadcrumbLd([
          { name: "CortexClip", path: "/" },
          { name: "Dokumentasi", path: "/docs" },
        ]),
      ),
      ldScript(faqLd(DOCS_FAQ)),
    ],
  }),
  component: DocsPage,
});

function DocsPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-[1180px] px-4 pb-24 pt-10 sm:px-6">
        <header>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
            Dokumentasi
          </p>
          <h1 className="mt-3 font-display text-[30px] leading-[1.06] font-bold tracking-tight sm:text-[44px]">
            Panduan lengkap CortexClip.
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            Semua yang perlu kamu tahu: cara pakai, apa yang dikerjakan setiap fitur, batas
            pemakaian, berapa lama prosesnya, dan apa yang harus dilakukan kalau ada yang tidak
            berjalan.
          </p>
        </header>

        <div className="mt-10 grid gap-10 lg:grid-cols-[220px_1fr] lg:gap-14">
          <nav aria-label="Daftar isi" className="lg:sticky lg:top-24 lg:self-start">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Isi halaman
            </p>
            <ul className="mt-3 space-y-1">
              {TOC.map((t) => (
                <li key={t.id}>
                  <a
                    href={`#${t.id}`}
                    className="block rounded-lg px-2 py-1.5 text-[13.5px] text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
                  >
                    {t.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="min-w-0 space-y-10">
            <DocsIntro />
            <DocsFeatures />
            <DocsLimits />
            <DocsHelp />
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
