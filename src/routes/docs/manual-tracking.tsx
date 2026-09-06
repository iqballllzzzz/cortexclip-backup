import { createFileRoute } from "@tanstack/react-router";
import { DocsShell } from "@/components/docs/docs-shell";

const title = "Manual Tracking: kamera mengikuti subjek pilihanmu";
const description =
  "Cara memakai manual tracking CortexClip: klik subjek di video, AI mengenali objeknya, border mengikuti gerakan, kamera mereframe otomatis ke 9:16.";

export const Route = createFileRoute("/docs/manual-tracking")({
  head: () => ({ meta: [{ title: `${title} — CortexClip` }, { name: "description", content: description }] }),
  component: ManualTrackPage,
});

function ManualTrackPage() {
  return (
    <DocsShell title={title} lead={description}>
      <section>
        <h2>Cara kerja (3 prinsip)</h2>
        <ul>
          <li>Scene-by-scene: video klip dibagi adegan ±10 detik; kamu bisa menetapkan subjek berbeda untuk tiap adegan.</li>
          <li>AI-assisted identification: cukup KLIK subjek — AI memilih objek terdekat dari titik klik; tidak perlu menggambar kotak manual.</li>
          <li>Smooth object tracking: kamera bergeser halus mengikuti subjek supaya selalu berada di tengah bingkai vertikal.</li>
        </ul>
      </section>
      <section>
        <h2>Langkah memakai</h2>
        <ul>
          <li>Buka editor klip → menu ⋮ di kanan pratinjau → Manual Tracking.</li>
          <li>Dialog menampilkan video sumber 16:9 dengan pemutar buatan sendiri (play/pause, ±5 detik, scrub bar, mute).</li>
          <li>Ketuk orang/benda yang ingin dilacak. Border putih dengan titik sudut langsung membingkai objek — ukurannya menyesuaikan objek (kepala = sebesar kepala, botol = sebesar botol).</li>
          <li>Video diputar otomatis dan border mengikuti subjek bergerak; jika subjek keluar frame, border hilang dan muncul lagi saat terdeteksi.</li>
          <li>Tekan “Kunci subjek di adegan ini” → pratinjau klip dirender ulang dengan framing baru.</li>
        </ul>
      </section>
      <section>
        <h2>Ganti subjek</h2>
        <p>
          Ketuk titik lain di video kapan pun — AI mengulang pengenalan dari titik baru.
          Menyimpan adegan yang sama menimpa subjek lama; adegan lain tidak tersentuh.
        </p>
      </section>
      <section>
        <h2>Hubungan dengan Auto Split</h2>
        <p>
          Rentang manual tracking menimpa keputusan kamera otomatis pada adegannya. Di luar rentang
          itu, face tracking otomatis dan auto split bekerja seperti biasa — keduanya hidup berdampingan.
        </p>
      </section>
    </DocsShell>
  );
}
