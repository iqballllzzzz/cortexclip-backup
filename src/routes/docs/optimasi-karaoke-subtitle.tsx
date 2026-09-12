import { createFileRoute } from "@tanstack/react-router";
import { DocsShell } from "@/components/docs/docs-shell";
import { SITE_URL, breadcrumbLd, ldScript } from "@/lib/seo-jsonld";

const title = "Psikologi Subtitle Karaoke: Meningkatkan Watch Time Video Hingga 240%";
const description =
  "Mengapa takarir dinamis bergaya karaoke yang berubah warna per kata terbukti melipatgandakan retensi penonton di TikTok, Instagram Reels, dan YouTube Shorts.";

export const Route = createFileRoute("/docs/optimasi-karaoke-subtitle")({
  head: () => ({
    meta: [
      { title: `${title} — CortexClip AI Docs` },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "article" },
      { property: "og:url", content: `${SITE_URL}/docs/optimasi-karaoke-subtitle` },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/docs/optimasi-karaoke-subtitle` }],
    scripts: [
      ldScript(
        breadcrumbLd([
          { name: "CortexClip", path: "/" },
          { name: "Dokumentasi", path: "/docs" },
          { name: title, path: "/docs/optimasi-karaoke-subtitle" },
        ]),
      ),
    ],
  }),
  component: SubtitleKaraokeDocsPage,
});

function SubtitleKaraokeDocsPage() {
  return (
    <DocsShell
      title={title}
      lead="Lebih dari 80% pengguna media sosial menonton video di tempat umum atau transportasi tanpa mengaktifkan suara (mute mode). Subtitle bukan lagi sekadar pelengkap aksesibilitas, melainkan mesin pendorong utama retensi algoritma."
    >
      <section>
        <h2>1. Masalah Subtitle Statis Tradisional</h2>
        <p>
          Subtitle bergaya film bioskop konvensional (blok teks panjang 2 baris di bawah layar yang diam selama 3 detik) memiliki kelemahan fatal pada format video pendek:
        </p>
        <ul>
          <li><strong>Mata Malas Membaca:</strong> Otak penonton membaca seluruh kalimat dalam 0.5 detik pertama, kemudian kehilangan ketertarikan sebelum pembicara selesai mengucapkan kalimat tersebut.</li>
          <li><strong>Menutupi Elemen Kritis:</strong> Blok teks statis sering kali menabrak tombol like, komentar, atau caption asli antarmuka TikTok/Reels.</li>
        </ul>
      </section>

      <section>
        <h2>2. Efek Karaoke Interaktif (Word-by-Word Kinetic Typography)</h2>
        <p>
          Ketika sebuah kata menyala secara dinamis tepat saat diucapkan:
        </p>
        <ul>
          <li><strong>Dopamine Micro-Pacing:</strong> Otak manusia secara naluriah terpancing untuk mengikuti ritme visual yang sinkron dengan audio. Ini menciptakan efek visual yang menghipnotis penonton untuk terus menatap layar hingga detik terakhir.</li>
          <li><strong>Eliminasi Dead Gap:</strong> Dengan algoritma sinkronisasi kata CortexClip AI, kata yang sedang aktif tetap menyala hingga suku kata berikutnya dimulai. Tidak ada jeda kedip hitam yang membingungkan mata penonton.</li>
          <li><strong>Highlight Warna Kontras Tinggi:</strong> Menggunakan warna kuning menyala (`#FFE000`) atau hijau neon dengan garis tepi hitam solid 3px, memastikan teks terbaca jelas di atas warna baju apa pun.</li>
        </ul>
      </section>

      <section>
        <h2>3. Memilih Preset Terbaik Sesuai Niche Konten</h2>
        <ul>
          <li><strong>Preset Default / TikTok Pop:</strong> Sangat ideal untuk konten edukasi bisnis, finansial, dan wawancara inspiratif (Alex Hormozi style).</li>
          <li><strong>Preset MrBeast:</strong> Huruf tebal dengan ekspresi energik, sangat cocok untuk konten gaming, reaksi, atau vlog seru.</li>
          <li><strong>Preset Clean Minimal:</strong> Tampilan rahasia elegan untuk podcast reflektif, puisi, filsafat, atau kutipan buku mendalam.</li>
        </ul>
      </section>
    </DocsShell>
  );
}
