/**
 * JSON-LD (structured data) untuk Google.
 *
 * Tujuan:
 *  - situs ketemu saat orang mencari variasi nama brand (cortexclip,
 *    cortexclip ai, cortexclip-ai, CortexclipAI, ...) lewat `alternateName`
 *  - memberi Google struktur navigasi yang jelas supaya berpeluang
 *    menampilkan sitelinks (Docs, Studio, dsb). Sitelinks TIDAK bisa
 *    dipaksa — Google memilih sendiri dari navigasi & tautan internal.
 */
export const SITE_URL = "https://cortexclip.eu.cc";

const BRAND_ALIASES = [
  "CortexClip",
  "CortexClip AI",
  "CortexclipAI",
  "cortexclip",
  "cortexclipai",
  "cortexclip ai",
  "cortexclip-ai",
  "Cortex Clip",
  "Cortex Clip AI",
];

export const organizationLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "CortexClip",
  alternateName: BRAND_ALIASES,
  url: SITE_URL,
  logo: `${SITE_URL}/favicon.png`,
  description:
    "CortexClip AI mengubah video panjang menjadi klip vertikal siap unggah dengan subtitle karaoke, face tracking, dan metadata otomatis.",
  email: "cs@cortexclip.app",
  areaServed: "ID",
};

export const websiteLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "CortexClip",
  alternateName: BRAND_ALIASES,
  url: SITE_URL,
  inLanguage: "id-ID",
  publisher: { "@type": "Organization", name: "CortexClip", url: SITE_URL },
};

export const softwareLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "CortexClip",
  alternateName: BRAND_ALIASES,
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Web",
  url: SITE_URL,
  inLanguage: "id-ID",
  description:
    "AI auto clipper: satu video panjang jadi banyak klip vertikal 9:16 dengan subtitle karaoke, face tracking otomatis, ikon, emoji, dan b-roll relevan.",
  featureList: [
    "Pemilihan momen berpotensi viral",
    "Subtitle karaoke kata-per-kata",
    "Face tracking multi-orang",
    "Reframe 9:16 otomatis",
    "Ikon, emoji, dan b-roll sesuai genre",
    "Judul, deskripsi, dan hashtag otomatis",
  ],
  offers: [
    { "@type": "Offer", name: "Gratis", price: "0", priceCurrency: "IDR" },
    { "@type": "Offer", name: "Premium 1 Hari", price: "3000", priceCurrency: "IDR" },
    { "@type": "Offer", name: "Premium 5 Hari", price: "8000", priceCurrency: "IDR" },
    { "@type": "Offer", name: "Premium 1 Bulan", price: "25000", priceCurrency: "IDR" },
    { "@type": "Offer", name: "Premium 1 Tahun", price: "210000", priceCurrency: "IDR" },
  ],
};

/** Sitelinks tidak bisa dipaksa, tapi struktur navigasi yang jelas membantu. */
export function breadcrumbLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${SITE_URL}${it.path}`,
    })),
  };
}

export function faqLd(qa: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: qa.map((x) => ({
      "@type": "Question",
      name: x.q,
      acceptedAnswer: { "@type": "Answer", text: x.a },
    })),
  };
}

/**
 * Harga + rating dalam satu blok Product.
 *
 * Kenapa terpisah dari softwareLd: `offers` di SoftwareApplication tidak
 * memenuhi syarat rich result harga Google, sedangkan Product dengan
 * `AggregateOffer` (lowPrice/highPrice/priceCurrency) berpeluang menampilkan
 * rentang harga langsung di hasil pencarian — itu yang membuat listing
 * menonjol dibanding pesaing yang hanya teks biru.
 *
 * TIDAK memakai aggregateRating: Google mensyaratkan rating berasal dari
 * ulasan nyata yang terlihat di halaman. Memalsukannya berisiko penalti
 * manual, jadi sengaja dikosongkan sampai ada ulasan asli.
 */
export const productLd = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "CortexClip AI",
  alternateName: BRAND_ALIASES,
  url: SITE_URL,
  image: `${SITE_URL}/favicon.png`,
  brand: { "@type": "Brand", name: "CortexClip" },
  category: "Video Editing Software",
  description:
    "AI auto clipper berbahasa Indonesia: satu video panjang jadi puluhan klip vertikal 9:16 dengan subtitle karaoke, face tracking, dan metadata siap unggah.",
  offers: {
    "@type": "AggregateOffer",
    priceCurrency: "IDR",
    lowPrice: "0",
    highPrice: "210000",
    offerCount: 5,
    availability: "https://schema.org/InStock",
    url: `${SITE_URL}/`,
  },
};

/**
 * HowTo — cara memakai CortexClip dalam 4 langkah.
 *
 * Google memakai skema ini untuk kueri berpola "cara ..." / "how to ...",
 * yang justru paling sering dipakai orang mencari alat seperti ini
 * ("cara memotong video panjang jadi shorts").
 */
export const howToLd = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "Cara mengubah video panjang jadi klip vertikal dengan CortexClip",
  description:
    "Langkah memotong podcast, webinar, atau ceramah menjadi klip pendek 9:16 siap unggah ke TikTok, Reels, dan Shorts.",
  inLanguage: "id-ID",
  totalTime: "PT8M",
  tool: [{ "@type": "HowToTool", name: "CortexClip AI" }],
  step: [
    {
      "@type": "HowToStep",
      position: 1,
      name: "Tempel link atau unggah video",
      text: "Masukkan URL YouTube atau unggah berkas video. CortexClip mengunduh dan menyiapkannya di server, jadi kamu boleh menutup halaman.",
      url: `${SITE_URL}/#mulai`,
    },
    {
      "@type": "HowToStep",
      position: 2,
      name: "AI memilih momen berpotensi viral",
      text: "Transkripsi otomatis lalu penilaian tiap bagian: kekuatan hook, kejelasan konteks, dan penutup. Setiap klip mendapat virality score.",
    },
    {
      "@type": "HowToStep",
      position: 3,
      name: "Atur subtitle dan framing di editor",
      text: "Pilih gaya subtitle karaoke, aktifkan face tracking atau auto split untuk video dua orang, tambahkan ikon dan b-roll.",
    },
    {
      "@type": "HowToStep",
      position: 4,
      name: "Unduh klip 720p siap unggah",
      text: "Render menghasilkan MP4 vertikal 720x1280 dengan subtitle terbakar, plus judul, deskripsi, dan hashtag otomatis.",
      url: `${SITE_URL}/unduh`,
    },
  ],
};

/** Bentuk objek <script type="application/ld+json"> untuk head route. */
export function ldScript(data: unknown) {
  return { type: "application/ld+json", children: JSON.stringify(data) };
}
