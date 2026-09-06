import { createFileRoute } from "@tanstack/react-router";
import { DocsShell } from "@/components/docs/docs-shell";

const title = "Keamanan & data kamu";
const description =
  "Bagaimana CortexClip menyimpan dan melindungi data: video milik akunmu saja, verifikasi email, penghapusan penuh, dan kebijakan retensi otomatis.";

export const Route = createFileRoute("/docs/keamanan")({
  head: () => ({ meta: [{ title: `${title} — CortexClip` }, { name: "description", content: description }] }),
  component: KeamananPage,
});

function KeamananPage() {
  return (
    <DocsShell title={title} lead={description}>
      <section>
        <h2>Video kamu milik kamu</h2>
        <p>
          Setiap berkas — sumber, klip, pratinjau, logo — disimpan dalam folder khusus akun kamu.
          Permintaan orang lain terhadap berkasmu ditolak di tingkat database (RLS) dan di setiap
          endpoint backend.
        </p>
      </section>
      <section>
        <h2>Verifikasi email</h2>
        <p>
          Pendaftaran baru menerima kode verifikasi ke alamat email. Akun belum terverifikasi tidak
          bisa masuk — ini mencegah akun palsu dan spam.
        </p>
      </section>
      <section>
        <h2>Hapus total</h2>
        <p>
          Menghapus proyek dari dashboard menghapus SEMUANYA di server: klip, video sumber,
          pratinjau, thumbnail, dan baris database — bukan sekadar menyembunyikan.
        </p>
      </section>
      <section>
        <h2>Pembersihan otomatis</h2>
        <ul>
          <li>Video sumber YouTube yang tidak dibuka &gt;30 hari dihapus otomatis (klip tetap ada).</li>
          <li>Proyek tanpa aktivitas &gt;180 hari dihapus penuh.</li>
          <li>Antrean dan log lama dibersihkan berkala.</li>
        </ul>
      </section>
      <section>
        <h2>Batas permintaan</h2>
        <p>
          Endpoint dipasangi rate-limit supaya satu akun tidak bisa membanjiri server dan
          mengganggu pengguna lain.
        </p>
      </section>
    </DocsShell>
  );
}
