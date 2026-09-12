import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/kebijakan-privasi")({
  head: () => ({
    meta: [
      { title: "Kebijakan Privasi — CortexClip AI" },
      {
        name: "description",
        content:
          "Kebijakan privasi CortexClip AI mengatur bagaimana data pengguna, video, transkrip, cookie, dan informasi pembayaran diproses secara aman sesuai regulasi perlindungan data pribadi.",
      },
    ],
  }),
  component: KebijakanPrivasiPage,
});

function KebijakanPrivasiPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-[860px] px-4 pb-24 pt-12 sm:px-6">
        <header className="border-b border-border pb-8">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent">
            <ShieldCheck className="size-4" /> Kepatuhan Regulasi & Keamanan Data
          </p>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Kebijakan Privasi
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Terakhir diperbarui: 10 September 2026 · Berlaku efektif untuk seluruh pengguna platform CortexClip AI.
          </p>
        </header>

        <article className="mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground sm:text-base [&_h2]:mt-6 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-foreground [&_h3]:font-display [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
          <p>
            Selamat datang di <strong>CortexClip AI</strong> (<span className="text-foreground">cortexclip.eu.cc</span>). Kami sangat menghargai privasi Anda dan berkomitmen untuk melindungi informasi pribadi Anda sesuai dengan Undang-Undang Perlindungan Data Pribadi (UU PDP No. 27 Tahun 2022) di Indonesia serta standar privasi global (GDPR).
          </p>

          <section>
            <h2>1. Informasi yang Kami Kumpulkan</h2>
            <p>Untuk menyediakan layanan pemrosesan klip video cerdas, kami mengumpulkan jenis informasi berikut:</p>
            <ul>
              <li><strong>Informasi Akun:</strong> Alamat email, nama tampilan, dan token autentikasi yang Anda berikan saat pendaftaran.</li>
              <li><strong>Konten Media:</strong> Tautan video publik (YouTube, TikTok, Instagram) atau berkas video yang Anda unggah untuk diproses menjadi klip pendek.</li>
              <li><strong>Data Penggunaan Teknis:</strong> Alamat IP, tipe peramban (browser), sistem operasi, waktu akses, serta riwayat konversi untuk pemeliharaan performa server.</li>
              <li><strong>Informasi Transaksi:</strong> Data konfirmasi pembayaran paket premium (kami tidak menyimpan data kartu kredit atau PIN; seluruh pembayaran diproses aman melalui gateway QRIS berizin resmi).</li>
            </ul>
          </section>

          <section>
            <h2>2. Bagaimana Kami Menggunakan Data Anda</h2>
            <p>Data yang dikumpulkan hanya digunakan untuk keperluan fungsional berikut:</p>
            <ul>
              <li>Menjalankan model kecerdasan buatan (Speech-to-Text, analisis hook viral, pemosisian wajah, dan rendering subtitle karaoke).</li>
              <li>Menyimpan preferensi tata letak klip, gaya subtitle, dan riwayat proyek di meja kerja Anda.</li>
              <li>Mengirimkan kode OTP verifikasi akun dan notifikasi status pemrosesan video penting.</li>
              <li>Mencegah penyalahgunaan sistem, serangan bot otomatis, penipuan, dan spam pendaftaran massal.</li>
            </ul>
          </section>

          <section>
            <h2>3. Penggunaan Cookie & Jaringan Periklanan Pihak Ketiga (Google AdSense)</h2>
            <p>
              Situs web kami dapat bekerja sama dengan vendor pihak ketiga, termasuk Google, yang menggunakan cookie untuk menayangkan iklan berdasarkan kunjungan sebelumnya ke situs web ini atau situs web lain di internet:
            </p>
            <ul>
              <li>Penggunaan cookie periklanan oleh Google memungkinkan Google dan mitranya menayangkan iklan kepada pengguna kami berdasarkan kunjungan mereka ke situs kami dan/atau situs lain di Internet.</li>
              <li>Pengguna dapat memilih untuk menonaktifkan iklan hasil personalisasi dengan mengunjungi <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer" className="text-accent underline">Setelan Iklan Google</a>.</li>
              <li>Kami juga menggunakan Cloudflare Turnstile untuk verifikasi anti-bot yang mematuhi privasi tanpa mengumpulkan data lintas situs.</li>
            </ul>
          </section>

          <section>
            <h2>4. Retensi & Penghapusan Berkas Video</h2>
            <p>
              Kami mengutamakan efisiensi dan privasi data media Anda. Berkas video mentah sementara yang diunggah diproses secara terisolasi di server kami dan secara otomatis dibersihkan melalui sistem pembersihan berkala. Anda memiliki hak penuh untuk menghapus proyek dan klip Anda kapan saja dari dashboard pengguna, yang akan menghapus data terkait dari database dan penyimpanan kami secara permanen.
            </p>
          </section>

          <section>
            <h2>5. Keamanan Data</h2>
            <p>
              Seluruh transmisi data antara peramban Anda dan peladen kami dilindungi oleh enkripsi Transport Layer Security (TLS/HTTPS 256-bit). Akses basis data dibatasi ketat menggunakan Row-Level Security (RLS), memastikan tidak ada pengguna lain yang dapat melihat, mengedit, atau mengunduh proyek klip Anda.
            </p>
          </section>

          <section>
            <h2>6. Hubungi Kami</h2>
            <p>
              Jika Anda memiliki pertanyaan mengenai Kebijakan Privasi ini atau ingin mengajukan hak privasi data Anda, silakan hubungi tim kami melalui:
            </p>
            <ul>
              <li>Email Resmi: <span className="font-mono text-foreground">verifikasi@aqualibrya.my.id</span> / <span className="font-mono text-foreground">admin@cortexclip.app</span></li>
              <li>Layanan WhatsApp Resmi: <a href="https://wa.me/6285183317385" target="_blank" rel="noopener noreferrer" className="text-accent underline">0851-8331-7385</a></li>
              <li>Komunitas Resmi: Saluran WhatsApp SANNN FORUM & CortexClip Official</li>
            </ul>
          </section>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
