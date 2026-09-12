import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Scale } from "lucide-react";

export const Route = createFileRoute("/syarat-ketentuan")({
  head: () => ({
    meta: [
      { title: "Syarat dan Ketentuan Layanan — CortexClip AI" },
      {
        name: "description",
        content:
          "Syarat dan ketentuan resmi penggunaan platform SaaS AI CortexClip, hak cipta konten, penggunaan wajar, paket berlangganan, dan kebijakan pengembalian dana.",
      },
    ],
  }),
  component: SyaratKetentuanPage,
});

function SyaratKetentuanPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-[860px] px-4 pb-24 pt-12 sm:px-6">
        <header className="border-b border-border pb-8">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent">
            <Scale className="size-4" /> Ketentuan Hukum & Penggunaan Platform
          </p>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Syarat & Ketentuan Layanan
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Terakhir diperbarui: 10 September 2026 · Mengikat seluruh pengguna situs web CortexClip AI.
          </p>
        </header>

        <article className="mt-8 space-y-8 text-sm leading-relaxed text-muted-foreground sm:text-base [&_h2]:mt-6 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-foreground [&_h3]:font-display [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
          <section>
            <h2>1. Penerimaan Ketentuan</h2>
            <p>
              Dengan mendaftar, mengakses, atau menggunakan platform <strong>CortexClip AI</strong>, Anda menyatakan bahwa Anda telah membaca, memahami, dan menyetujui untuk terikat dengan seluruh syarat dan ketentuan yang tercantum di halaman ini. Jika Anda tidak menyetujui ketentuan ini, Anda dipersilakan untuk tidak menggunakan platform kami.
            </p>
          </section>

          <section>
            <h2>2. Deskripsi Layanan</h2>
            <p>
              CortexClip AI adalah perangkat lunak berbasis web (SaaS) yang menyediakan otomatisasi pemotongan video berdurasi panjang menjadi klip pendek berorientasi vertikal (9:16), pembuatan takarir karaoke otomatis, analisis momen viral berbasis kecerdasan buatan, serta stabilisasi pelacakan wajah (*smart adaptive tracking*).
            </p>
          </section>

          <section>
            <h2>3. Hak Kekayaan Intelektual & Kepemilikan Konten</h2>
            <ul>
              <li><strong>Konten Pengguna:</strong> Anda memegang hak cipta penuh atas video asli yang Anda proses melalui CortexClip AI. Kami tidak mengklaim kepemilikan apa pun atas klip hasil render Anda.</li>
              <li><strong>Tanggung Jawab Hak Cipta:</strong> Pengguna bertanggung jawab penuh untuk memastikan bahwa video yang diunduh atau diproses memiliki izin atau mematuhi asas *fair use* (penggunaan wajar) untuk keperluan kurasi, kutipan, ulasan, atau edukasi.</li>
              <li><strong>Hak Cipta Platform:</strong> Kode sumber, antarmuka visual, logo, dan algoritma CortexClip AI adalah hak milik eksklusif pengembang dan dilindungi undang-undang hak cipta.</li>
            </ul>
          </section>

          <section>
            <h2>4. Pembayaran Paket Premium & Kebijakan Kuota</h2>
            <ul>
              <li>Paket Premium (1 Hari, 5 Hari, 1 Bulan, 1 Tahun) memberikan akses instan tanpa watermark, kuota pemrosesan harian yang lebih tinggi, dan prioritas render.</li>
              <li>Seluruh transaksi melalui pembayaran QRIS adalah final setelah layanan diaktifkan ke akun pengguna.</li>
              <li>Kredit atau kuota harian akan diatur ulang setiap 24 jam secara otomatis.</li>
            </ul>
          </section>

          <section>
            <h2>5. Batasan Tanggung Jawab</h2>
            <p>
              CortexClip AI beroperasi dengan infrastruktur server berkinerja tinggi, namun kami tidak bertanggung jawab atas kerugian tidak langsung atau pemblokiran akun media sosial pihak ketiga (seperti TikTok, YouTube, atau Meta) akibat pelanggaran pedoman komunitas platform tersebut oleh pengguna.
            </p>
          </section>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
