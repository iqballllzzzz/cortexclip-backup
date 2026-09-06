import { createFileRoute } from "@tanstack/react-router";
import { DocsShell } from "@/components/docs/docs-shell";

const title = "Batas pemakaian & perkiraan lama proses";
const description =
  "Kuota gratis dan premium CortexClip, berapa lama tiap tahap memakan waktu, dan batas ukuran berkas.";

export const Route = createFileRoute("/docs/batas")({
  head: () => ({ meta: [{ title: `${title} — CortexClip` }, { name: "description", content: description }] }),
  component: BatasPage,
});

function BatasPage() {
  return (
    <DocsShell title={title} lead={description}>
      <section>
        <h2>Perkiraan lama proses</h2>
        <ul>
          <li>Unduh video YouTube di server: tergantung ukuran, umumnya 1–4 menit.</li>
          <li>Transkripsi: ±1 menit per 10 menit video (diproses paralel per potongan 45 detik).</li>
          <li>Pemilihan klip 2-tahap: 30–90 detik.</li>
          <li>Render pratinjau klip: 20–60 detik; render unduhan 1080p: rata-rata 150 detik per klip.</li>
        </ul>
      </section>
      <section>
        <h2>Kuota</h2>
        <p>
          Akun gratis mendapat sejumlah proyek per hari; Premium jauh lebih besar dan dengan antrean
          prioritas. Angka pastinya selalu terlihat di cincin kuota dashboard — tidak ada batasan tersembunyi.
        </p>
      </section>
      <section>
        <h2>Batas berkas</h2>
        <ul>
          <li>Video: tidak ada batas keras — diproses per potongan; berkas ratusan MB aman.</li>
          <li>Logo custom: maksimal 25 MB, PNG/JPG/WebP.</li>
          <li>URL YouTube harus video publik (bukan private/members-only).</li>
        </ul>
      </section>
      <section>
        <h2>Antrean render</h2>
        <p>
          Render unduhan masuk antrean; posisi kamu diberitahu lewat toast ("nomor antrean ke-N").
          Semua berjalan di server — menutup halaman tidak membatalkan pekerjaan.
        </p>
      </section>
    </DocsShell>
  );
}
