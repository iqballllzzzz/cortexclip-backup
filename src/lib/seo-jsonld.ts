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

/** Bentuk objek <script type="application/ld+json"> untuk head route. */
export function ldScript(data: unknown) {
  return { type: "application/ld+json", children: JSON.stringify(data) };
}
