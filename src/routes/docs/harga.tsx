import { createFileRoute } from "@tanstack/react-router";
import { DocsShell } from "@/components/docs/docs-shell";

const title = "Harga, Premium, dan QRIS";
const description =
  "Daftar harga premium CortexClip, cara bayar QRIS, versi gratis dengan menonton iklan, dan apa saja yang didapat.";

export const Route = createFileRoute("/docs/harga")({
  head: () => ({ meta: [{ title: `${title} — CortexClip` }, { name: "description", content: description }] }),
  component: HargaPage,
});

function HargaPage() {
  return (
    <DocsShell title={title} lead={description}>
      <section>
        <h2>Paket</h2>
        <ul>
          <li>1 hari — Rp5.000</li>
          <li>5 hari — Rp19.000</li>
          <li>1 bulan — Rp89.000</li>
          <li>1 tahun — Rp299.000</li>
        </ul>
        <p>
          Sebagai pembanding: layanan sejenis internasional (OpusClip) ±Rp240.000–Rp464.000/bulan.
          Pembayaran kapan pun lewat QRIS dari aplikasi bank/e-wallet apa pun — tanpa kartu kredit.
        </p>
      </section>
      <section>
        <h2>Yang didapat Premium</h2>
        <ul>
          <li>100% Bebas Watermark di semua unduhan (klip bersih siap upload & monetisasi).</li>
          <li>Buka seluruh gaya & preset subtitle karaoke (Solar Gold, Punch, Editorial, Neon).</li>
          <li>Custom logo brand & hapus background otomatis di tiap klip.</li>
          <li>Fitur Smart Auto-Reframe & Auto-Split multi-speaker tanpa batas.</li>
          <li>Kuota proyek hingga 10 video panjang/hari dan 40 klip/video.</li>
          <li>Prioritas antrean render tertinggi di server GPU (proses 4x lebih cepat).</li>
          <li>Unduh cepat langsung tanpa syarat menonton iklan.</li>
        </ul>
      </section>
      <section>
        <h2>Gratis tetap bisa jalan</h2>
        <p>
          Akun gratis tetap mendapat seluruh fitur inti — transkripsi, pemilihan klip, editor penuh —
          dengan watermark. Ada juga jalur premium singkat lewat iklan: tonton 4 iklan untuk
          menghapus watermark dari 1 klip.
        </p>
      </section>
      <section>
        <h2>Cara bayar</h2>
        <ul>
          <li>Tekan tombol Upgrade (pojok kanan atas) → pilih paket.</li>
          <li>Pindai QRIS yang muncul; pembayaran diverifikasi otomatis (pemeriksaan tiap beberapa detik, sesi aktif ±1 jam).</li>
          <li>Premium aktif segera setelah terverifikasi.</li>
        </ul>
      </section>
    </DocsShell>
  );
}
