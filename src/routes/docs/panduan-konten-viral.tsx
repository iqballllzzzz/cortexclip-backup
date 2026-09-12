import { createFileRoute } from "@tanstack/react-router";
import { DocsShell } from "@/components/docs/docs-shell";
import { SITE_URL, breadcrumbLd, ldScript } from "@/lib/seo-jsonld";

const title = "Panduan Memotong Video Podcast Menjadi Klip Viral TikTok & Reels";
const description =
  "Strategi komprehensif menemukan momen bernilai tinggi dari video panjang berdurasi 1 jam, merancang hook 3 detik pertama, dan mengoptimalkan retensi penonton.";

export const Route = createFileRoute("/docs/panduan-konten-viral")({
  head: () => ({
    meta: [
      { title: `${title} — CortexClip AI Docs` },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "article" },
      { property: "og:url", content: `${SITE_URL}/docs/panduan-konten-viral` },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/docs/panduan-konten-viral` }],
    scripts: [
      ldScript(
        breadcrumbLd([
          { name: "CortexClip", path: "/" },
          { name: "Dokumentasi", path: "/docs" },
          { name: title, path: "/docs/panduan-konten-viral" },
        ]),
      ),
    ],
  }),
  component: PanduanViralPage,
});

function PanduanViralPage() {
  return (
    <DocsShell
      title={title}
      lead="Bukan sembarang potong — algoritma platform video pendek (TikTok, Instagram Reels, dan YouTube Shorts) memiliki kriteria spesifik dalam menilai kelayakan sebuah video untuk direkomendasikan ke jutaan pengguna di laman For You (FYP)."
    >
      <section>
        <h2>1. Anatomi Klip Video Bernilai Tinggi (The 3-Second Rule)</h2>
        <p>
          Menurut data analisis internal dari jutaan jam pemutaran video pendek, 68% audiens memutuskan untuk melanjutkan menonton atau menggeser (*swipe away*) video Anda dalam rentang 1.8 hingga 3 detik pertama. Inilah yang disebut dengan *Hook*.
        </p>
        <p className="mt-3">
          Klip yang sukses TIDAK PERNAH dimulai dengan basa-basi seperti: <em>"Halo guys, selamat datang kembali di podcast kami..."</em> atau <em>"Gimana kabarmu hari ini?"</em>.
        </p>
        <p className="mt-3">
          Sebaliknya, klip viral selalu dimulai langsung pada inti kalimat kontroversial, pernyataan mengejutkan, atau pertanyaan yang memicu rasa penasaran mendalam (*curiosity gap*):
        </p>
        <ul className="mt-2">
          <li><strong>Pernyataan Kontraintuitif:</strong> <em>"Jangan pernah nonton konten motivasi sebelum lo paham pola pikir ini..."</em></li>
          <li><strong>Angka & Statistik Mengejutkan:</strong> <em>"74% orang yang sering main medsos diam-diam ngalamin depresi jenis ini..."</em></li>
          <li><strong>Kisah Ekstrem:</strong> <em>"Dari saldo minus di rekening, cara ini bikin gue dapet 100 juta pertama di umur 20..."</em></li>
        </ul>
      </section>

      <section>
        <h2>2. Mengapa AI Scoring CortexClip Mempermudah Anda</h2>
        <p>
          Menonton video wawancara berdurasi 60 hingga 90 menit untuk menemukan 5 kalimat terbaik adalah pekerjaan yang sangat melelahkan jika dilakukan secara manual. CortexClip AI mengotomatiskan proses kurasi ini melalui algoritma evaluasi berjenjang:
        </p>
        <ul>
          <li><strong>Windowing Transkrip:</strong> Seluruh ucapan dipindai dalam jendela rentang 45 hingga 75 detik.</li>
          <li><strong>Deteksi Intonasi & Puncak Energi:</strong> Mengidentifikasi saat pembicara berbicara dengan penekanan emosi lebih tinggi atau perubahan nada suara yang dramatis.</li>
          <li><strong>Pemberian Skor Viralitas (0–100):</strong> Memprioritaskan segmen yang memiliki awal kalimat kuat dan konklusi yang utuh tanpa terputus di tengah jalan.</li>
        </ul>
      </section>

      <section>
        <h2>3. Optimasi Visual: Vertikal 9:16 & Smart Tracking</h2>
        <p>
          Mayoritas video podcast di YouTube direkam dalam format horizontal (16:9). Memotongnya secara asal ke 9:16 sering kali membuat pembicara berada di luar bingkai layar atau terpotong saat bergerak.
        </p>
        <p className="mt-3">
          Gunakan fitur <strong>Smart Adaptive Camera Stabilizer</strong> di CortexClip:
        </p>
        <ul>
          <li><strong>Kamera Terkunci (Tripod Mode):</strong> Saat pembicara duduk santai, kamera diam 100% tanpa goyangan (*zero jitter*).</li>
          <li><strong>Pergerakan Mulus (Paparazi Mode):</strong> Saat pembicara bergerak atau berpindah posisi, kamera meluncur dengan akselerasi halus (*smoothstep cubic*) menjaga subjek tetap di sepertiga atas bingkai layar.</li>
        </ul>
      </section>

      <section>
        <h2>4. Checklist Sebelum Mengunggah ke Media Sosial</h2>
        <ul>
          <li>Pastikan durasi klip berkisar antara 45 hingga 65 detik (durasi optimal untuk retensi dan skor penyelesaian video).</li>
          <li>Gunakan gaya takarir yang kontras tinggi (seperti preset Default atau Hormozi berwarna kuning di atas latar gelap).</li>
          <li>Sertakan ajakan interaksi (*Call-to-Action*) alami di akhir takarir: <em>"Setuju gak sama pendapat ini? Tulis di komentar!"</em></li>
          <li>Gunakan 3 hingga 5 hashtag yang relevan (gabungan hashtag topik spesifik dan hashtag rekomendasi umum).</li>
        </ul>
      </section>
    </DocsShell>
  );
}
