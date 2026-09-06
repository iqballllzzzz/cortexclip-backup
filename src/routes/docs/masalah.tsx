import { createFileRoute } from "@tanstack/react-router";
import { DocsShell } from "@/components/docs/docs-shell";

const title = "Masalah umum & solusinya";
const description =
  "Daftar masalah yang sering dialami pengguna CortexClip beserta cara mengatasinya: email verifikasi, pratinjau lama, YouTube gagal, dan lainnya.";

export const Route = createFileRoute("/docs/masalah")({
  head: () => ({ meta: [{ title: `${title} — CortexClip` }, { name: "description", content: description }] }),
  component: MasalahPage,
});

function MasalahPage() {
  return (
    <DocsShell title={title} lead={description}>
      <section>
        <h2>Kode verifikasi tidak sampai</h2>
        <ul>
          <li>Cek folder spam/promosi.</li>
          <li>Pastikan alamat diketik benar; tunggu 1–2 menit sebelum kirim ulang.</li>
          <li>Beberapa provider menunda email baru — kalau lebih dari 10 menit, hubungi admin.</li>
        </ul>
      </section>
      <section>
        <h2>Halaman "tidak bisa dibuka" setelah update</h2>
        <p>
          Tab lama memegang berkas versi sebelumnya. Muat ulang halaman sekali (tarik-ke-bawah di
          ponsel) — sistem juga menyembunyikan berkas lama supaya transisi mulus.
        </p>
      </section>
      <section>
        <h2>Pratinjau tidak berubah setelah mengatur</h2>
        <p>
          Pratinjau yang memengaruhi framing (auto split, manual tracking, logo) dirender ulang
          otomatis. Kalau tampak macet di satu persen: tunggu — indikator menunjukkan kemajuan nyata
          dari encoder; atau muat ulang halaman dan render dilanjutkan.
        </p>
      </section>
      <section>
        <h2>URL YouTube gagal diproses</h2>
        <ul>
          <li>Hanya video publik yang bisa; private/members-only ditolak.</li>
          <li>Video berdurasi sangat panjang dipotong otomatis — coba bagian spesifik bila perlu.</li>
        </ul>
      </section>
      <section>
        <h2>Klip hasil render gagal</h2>
        <p>
          Kartu unduhan menampilkan pesan penyebab. Umumnya karena sumber dihapus saat antre; buka
          proyek dan render ulang dari klip yang masih ada.
        </p>
      </section>
      <section>
        <h2>Masih buntu?</h2>
        <p>
          Kirim tangkapan layar + judul proyek ke admin. Panel admin melihat status antrean dan
          kesehatan model AI secara langsung, jadi laporan yang menyebut judul proyek sangat mempercepat penelusuran.
        </p>
      </section>
    </DocsShell>
  );
}
