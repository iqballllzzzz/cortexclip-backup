import { createFileRoute } from "@tanstack/react-router";
import { DocsShell } from "@/components/docs/docs-shell";

const title = "Mulai cepat: 5 menit dari video ke klip";
const description =
  "Panduan langkah demi langkah pertama kali memakai CortexClip: unggah video atau URL YouTube, tunggu klip, atur gaya, unduh.";

export const Route = createFileRoute("/docs/mulai-cepat")({
  head: () => ({ meta: [{ title: `${title} — CortexClip` }, { name: "description", content: description }] }),
  component: MulaiCepatPage,
});

function MulaiCepatPage() {
  return (
    <DocsShell title={title} lead={description}>
      <section>
        <h2>1. Masuk</h2>
        <p>
          Buka cortexclip.eu.cc, daftar dengan email (kode verifikasi dikirim ke kotak masuk kamu),
          lalu masuk. Akun gratis sudah bisa memakai semua fitur inti dengan watermark.
        </p>
      </section>
      <section>
        <h2>2. Mulai proyek baru</h2>
        <ul>
          <li>Tab YouTube: tempel tautan video publik, sistem mengunduhnya di server.</li>
          <li>Tab Perangkat: pilih berkas video (MP4/MOV/WebM sampai ratusan MB — diproses per potongan).</li>
        </ul>
      </section>
      <section>
        <h2>3. Tunggu AI bekerja</h2>
        <p>
          Kartu proyek muncul di dashboard dengan status berjalan: mengunduh → transkripsi →
          pemilihan klip. Video 1 jam biasanya selesai 4–7 menit. Kamu boleh menutup halaman.
        </p>
      </section>
      <section>
        <h2>4. Buka proyek, pilih klip</h2>
        <p>
          Setiap klip punya judul, skor potensi viral, deskripsi, dan hashtag yang sudah ditulis AI.
          Ketuk klip untuk membuka editor.
        </p>
      </section>
      <section>
        <h2>5. Atur gaya di editor</h2>
        <ul>
          <li>Subtitle: 8 preset gaya (Hormozi, TikTok Pop, Neon Glow, …), atur ukuran, posisi, transparansi.</li>
          <li>Ikon & B-Roll: AI menyisipkan ikon animasi dan video pendukung di momen tepat.</li>
          <li>Auto Split: dua orang bicara bergantian → layar otomatis dibagi dua.</li>
          <li>Manual Tracking (menu ⋮): klik subjek, kamera mengikutinya.</li>
          <li>Edit Transkrip: perbaiki kata yang salah dengar STT.</li>
        </ul>
        <p>Semua pengaturan tersimpan otomatis di server — keluar dari editor tidak kehilangan apa pun.</p>
      </section>
      <section>
        <h2>6. Unduh</h2>
        <p>
          Tekan Unduh; klip dirender 1080×1920 di server dan muncul di halaman Unduhan.
          Ketuk gambar klip untuk pratinjau jalan; ketuk klip lain, pratinjau sebelumnya berhenti otomatis.
        </p>
      </section>
    </DocsShell>
  );
}
