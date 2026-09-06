import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BookOpen,
  Clapperboard,
  Crosshair,
  Crown,
  HelpCircle,
  Play,
  Settings,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SITE_URL, breadcrumbLd, ldScript } from "@/lib/seo-jsonld";

const title = "Dokumentasi CortexClip AI — Panduan Lengkap";
const description =
  "Dokumentasi CortexClip AI dibagi per topik: pengenalan, mulai cepat, editor, manual tracking, custom logo, harga, keamanan, batas, dan pemecahan masalah.";

const HALAMAN = [
  { to: "/docs/what-is-cortexclipai", icon: Clapperboard, judul: "Apa itu CortexClip AI?", desc: "Apa masalah yang diselesaikan, alur dasar, dan kenapa dibuat di Indonesia." },
  { to: "/docs/mulai-cepat", icon: Play, judul: "Mulai cepat", desc: "Dari nol sampai klip pertama diunduh dalam 5 menit — langkah demi langkah." },
  { to: "/docs/editor", icon: Settings, judul: "Editor & semua panel", desc: "Subtitle karaoke, ikon, b-roll, emoji, auto split, menu titik-tiga, penyimpanan otomatis." },
  { to: "/docs/manual-tracking", icon: Crosshair, judul: "Manual Tracking", desc: "Klik subjek, AI mengikuti gerakannya — prinsip scene-by-scene dan cara memakainya." },
  { to: "/docs/custom-logo", icon: Crown, judul: "Custom Logo (Premium)", desc: "Pasang logo brand: hapus background otomatis, seret langsung di pratinjau." },
  { to: "/docs/harga", icon: Crown, judul: "Harga & QRIS", desc: "Paket premium, versi gratis dengan iklan, dan cara membayar." },
  { to: "/docs/keamanan", icon: ShieldCheck, judul: "Keamanan & data", desc: "Siapa yang bisa melihat videomu, verifikasi email, penghapusan penuh." },
  { to: "/docs/batas", icon: Timer, judul: "Batas & lama proses", desc: "Kuota, perkiraan waktu tiap tahap, dan antrean render." },
  { to: "/docs/masalah", icon: HelpCircle, judul: "Masalah umum", desc: "Solusi cepat untuk kendala yang paling sering dilaporkan." },
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
    ],
  }),
  component: DocsIndexPage,
});

function DocsIndexPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-[1180px] px-4 pb-24 pt-10 sm:px-6">
        <header>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
            <BookOpen className="size-3.5" /> Dokumentasi
          </p>
          <h1 className="mt-3 font-display text-[30px] leading-[1.06] font-bold tracking-tight sm:text-[44px]">
            Semua yang perlu kamu tahu.
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">
            Dokumentasi dibagi per topik supaya cepat ditemukan — pilih halaman di bawah.
          </p>
        </header>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {HALAMAN.map((h) => (
            <Link
              key={h.to}
              to={h.to}
              className="group flex flex-col rounded-2xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lg hover:shadow-black/5"
            >
              <span className="grid size-10 place-items-center rounded-xl border border-border bg-background text-accent">
                <h.icon className="size-5" />
              </span>
              <span className="mt-3.5 font-display text-[15.5px] font-bold tracking-tight">
                {h.judul}
              </span>
              <span className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                {h.desc}
              </span>
            </Link>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
