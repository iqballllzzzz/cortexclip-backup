import { createFileRoute } from "@tanstack/react-router";
import { DocsShell } from "@/components/docs/docs-shell";
import { SITE_URL, breadcrumbLd, ldScript } from "@/lib/seo-jsonld";

const title = "Panduan Monetisasi Video Klip AI: Shopee Video, TikTok Affiliate & FB Pro";
const description =
  "Cara membangun arus kas dan penghasilan pasif dari video potongan podcast dengan memanfaatkan program afiliasi, komisi keranjang kuning, dan bonus kreator.";

export const Route = createFileRoute("/docs/monetisasi-video-pendek")({
  head: () => ({
    meta: [
      { title: `${title} — CortexClip AI Docs` },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "article" },
      { property: "og:url", content: `${SITE_URL}/docs/monetisasi-video-pendek` },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/docs/monetisasi-video-pendek` }],
    scripts: [
      ldScript(
        breadcrumbLd([
          { name: "CortexClip", path: "/" },
          { name: "Dokumentasi", path: "/docs" },
          { name: title, path: "/docs/monetisasi-video-pendek" },
        ]),
      ),
    ],
  }),
  component: MonetisasiDocsPage,
});

function MonetisasiDocsPage() {
  return (
    <DocsShell
      title={title}
      lead="Potensi pasar konten video pendek di Indonesia sedang berada di titik tertinggi. Ribuan kreator independen menghasilkan jutaan hingga puluhan juta rupiah setiap bulan tanpa perlu menampilkan wajah sendiri."
    >
      <section>
        <h2>1. Tiga Sumber Pendapatan Utama Pembuat Klip</h2>
        <div className="mt-4 space-y-4">
          <div className="rounded-2xl border border-border bg-card p-4">
            <h3 className="font-display text-base font-bold text-foreground">A. TikTok Affiliate & Shopee Video (Keranjang Kuning)</h3>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              Kaitkan klip podcast yang membahas topik buku, produktivitas, suplemen kesehatan, atau gadget dengan produk terkait di keranjang kuning. Setiap kali penonton yang terinspirasi membeli barang lewat video Anda, Anda mendapatkan komisi 5% hingga 20%.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <h3 className="font-display text-base font-bold text-foreground">B. Facebook Professional (Reels Pro Performance Bonus)</h3>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              Meta memberikan pembayaran langsung per seribu tayangan (RPM) untuk video Reels yang memiliki durasi tonton tinggi. Satu video podcast yang menyentuh 1 juta penonton dapat menghasilkan $50 hingga $250.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <h3 className="font-display text-base font-bold text-foreground">C. YouTube Shorts Ad Revenue & Brand Endorsement</h3>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              Akun kurasi dengan ratusan ribu subscriber rutin mendapatkan tawaran promosi berbayar dari aplikasi, buku baru, atau penyelenggara seminar edukasi.
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2>2. Strategi Produksi Efisien (Kunci Konsistensi)</h2>
        <p>
          Kegagalan 90% pemain reupload dan affiliate adalah <strong>kehabisan energi karena proses pengeditan manual yang lambat</strong>. Jika Anda membutuhkan 2 jam untuk membuat 1 video, Anda akan cepat menyerah.
        </p>
        <p className="mt-3">
          Formula pemenang adalah <em>Volume x Quality</em>:
        </p>
        <ul>
          <li>Luangkan waktu 15 menit setiap pagi untuk memasukkan 2 tautan video YouTube baru ke <strong>CortexClip AI</strong>.</li>
          <li>Dapatkan 10 hingga 20 klip berkualitas tinggi yang sudah memiliki auto-crop 9:16, tracking wajah, dan subtitle karaoke.</li>
          <li>Jadwalkan unggahan 3 hingga 5 video per hari di masing-masing platform media sosial Anda.</li>
        </ul>
      </section>

      <section>
        <h2>3. Etika & Kepatuhan Hak Cipta (*Fair Use*)</h2>
        <p>
          Pastikan Anda selalu mencantumkan sumber asli video di dalam deskripsi atau sematkan kredit kecil: <em>"Sumber lengkap: Channel YouTube [Nama Creator]"</em>. Membantu mempromosikan kreator asli sambil mengkurasi klip bernilai tinggi menciptakan ekosistem saling menguntungkan (*win-win solution*).
        </p>
      </section>
    </DocsShell>
  );
}
