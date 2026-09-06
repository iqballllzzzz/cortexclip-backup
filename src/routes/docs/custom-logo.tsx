import { createFileRoute } from "@tanstack/react-router";
import { DocsShell } from "@/components/docs/docs-shell";

const title = "Custom Logo (Premium): pasang brand kamu di tiap klip";
const description =
  "Panduan custom logo CortexClip: unggah gambar, hapus background otomatis, seret & atur ukuran langsung di pratinjau. Fitur khusus Premium.";

export const Route = createFileRoute("/docs/custom-logo")({
  head: () => ({ meta: [{ title: `${title} — CortexClip` }, { name: "description", content: description }] }),
  component: CustomLogoPage,
});

function CustomLogoPage() {
  return (
    <DocsShell title={title} lead={description}>
      <section>
        <h2>Kenapa Premium</h2>
        <p>
          Klip gratis memakai watermark CortexClip. Premium menghapus watermark — jadi kamu bebas
          menaruh logo brand sendiri di pojok video. Inilah alasan custom logo hanya untuk Premium:
          tumpang-tindih dua watermark membuat hasil terlihat kotor.
        </p>
      </section>
      <section>
        <h2>Langkah memakai</h2>
        <ul>
          <li>Editor → menu ⋮ → Add Custom Logo.</li>
          <li>Pilih gambar (PNG/JPG/WebP sampai 25 MB). Akun non-premium otomatis disodori paket premium.</li>
          <li>Tekan Hapus Background — sistem meng-host gambar, memanggil penghapus background AI (v1, dengan cadangan v2), lalu menampilkan hasil PNG transparan.</li>
          <li>Tekan Setuju — logo muncul di pratinjau.</li>
          <li>Seret logo langsung di pratinjau untuk memindah; tarik titik di pojoknya untuk mengubah ukuran. Posisi tersimpan otomatis per klip.</li>
        </ul>
      </section>
      <section>
        <h2>Tips hasil bagus</h2>
        <ul>
          <li>Gunakan gambar logo resolusi tinggi minimal 512×512 supaya tajam di 1080p.</li>
          <li>Logo dengan latar polos menghasilkan pemotongan background paling bersih.</li>
          <li>Ukuran 12–20% lebar video biasanya cukup terlihat tanpa menutupi wajah.</li>
        </ul>
      </section>
      <section>
        <h2>Menghapus logo</h2>
        <p>
          Logo disimpan per klip — membuka klip lain berarti logo belum terpasang di sana.
          Hapus logo dari menu logo yang sama.
        </p>
      </section>
    </DocsShell>
  );
}
