import { createFileRoute } from "@tanstack/react-router";
import { DocsShell } from "@/components/docs/docs-shell";

const title = "Apa itu CortexClip AI?";
const description =
  "CortexClip AI adalah auto-clipper video berbasis AI buatan Indonesia: ubah video panjang atau YouTube jadi klip pendek vertikal siap viral dengan subtitle karaoke otomatis.";

export const Route = createFileRoute("/docs/what-is-cortexclipai")({
  head: () => ({ meta: [{ title: `${title} — CortexClip` }, { name: "description", content: description }] }),
  component: WhatIsPage,
});

function WhatIsPage() {
  return (
    <DocsShell title={title} lead={description}>
      <section>
        <h2>Ringkasnya</h2>
        <p>
          Satu video panjang masuk, banyak klip pendek keluar. CortexClip mendengarkan video kamu,
          memahami transkrip kata per kata, lalu memilih momen paling menarik untuk dijadikan klip
          vertikal 9:16 — lengkap dengan subtitle karaoke ala TikTok, face tracking, ikon, dan b-roll.
          Semua proses berjalan di server: kamu boleh menutup halaman, pekerjaan tetap lanjut.
        </p>
      </section>
      <section>
        <h2>Masalah yang diselesaikan</h2>
        <ul>
          <li>Potong video panjang manual butuh berjam-jam; CortexClip memilih momennya otomatis lewat AI 2 tahap.</li>
          <li>Bikin subtitle karaoke manual itu lambat; di sini digenerate otomatis dengan waktu per kata presisi.</li>
          <li>Framing vertikal dari video horizontal sering memotong wajah; face tracking AI menjaga wajah tetap di tengah.</li>
          <li>Tools sejenis (OpusClip, dsb.) mahal dan berorientasi pasar luar; CortexClip murah, berbahasa Indonesia, dan bayar pakai QRIS.</li>
        </ul>
      </section>
      <section>
        <h2>Alur dasar</h2>
        <ul>
          <li>Unggah video dari perangkat atau tempel URL YouTube.</li>
          <li>Server menyalin audio, mentranskripsi, lalu menilai tiap kandidat klip (skor 0–100).</li>
          <li>Kamu membuka proyek, memilih klip, lalu mengatur gaya di editor: subtitle, ikon, b-roll, emoji, auto split, manual tracking, sampai logo brand sendiri.</li>
          <li>Tekan Unduh — video dirender di server dan siap diunduh dari halaman Unduhan.</li>
        </ul>
      </section>
      <section>
        <h2>Dibuat di Indonesia</h2>
        <p>
          CortexClip dikembangkan dan dijalankan di server milik sendiri. Bahasa antarmuka penuh
          Indonesia-Inggris, dan pembayaran premium memakai QRIS — tanpa kartu kredit.
        </p>
      </section>
    </DocsShell>
  );
}
