import { createFileRoute } from "@tanstack/react-router";
import { DocsShell } from "@/components/docs/docs-shell";

const title = "Editor: subtitle, ikon, b-roll, dan semua panel";
const description =
  "Penjelasan tiap panel editor CortexClip: gaya subtitle karaoke, pisah ikon & b-roll, emoji, auto split, manual tracking, edit transkrip, dan custom logo premium.";

export const Route = createFileRoute("/docs/editor")({
  head: () => ({ meta: [{ title: `${title} — CortexClip` }, { name: "description", content: description }] }),
  component: EditorPage,
});

function EditorPage() {
  return (
    <DocsShell title={title} lead={description}>
      <section>
        <h2>Panel Subtitle</h2>
        <p>
          Delapan preset gaya: Hormozi, TikTok Pop, Neon Glow, Clean Minimal, Comic Bang, Sermon
          Elegant, Typewriter, dan Gaming Energy. Slider mengatur ukuran (60–180%), posisi vertikal
          (20–80%), dan transparansi. Pratinjau browser = hasil unduhan karena keduanya memakai
          rumus dan berkas font yang sama persis.
        </p>
      </section>
      <section>
        <h2>Panel Ikon: 4 saklar</h2>
        <ul>
          <li>Ikon — AI menempatkan ikon PNG animasi (kuning khas CortexClip) di momen kata kunci.</li>
          <li>B-Roll — video pendukung ditampilkan sebagai picture-in-picture di jendela waktu tertentu.</li>
          <li>Emoji — emoji kontekstual pada kata kunci (60+ kata Indonesia & Inggris).</li>
          <li>Auto Split — layar dibagi dua saat dua orang terdeteksi bicara bergantian; subtitle otomatis pindah ke garis tengah.</li>
        </ul>
        <p>
          Ikon dan b-roll bisa dinyalakan terpisah — kalau kamu hanya suka ikon saja, matikan b-roll.
          Tombol “Cari lain” meminta AI merencanakan ulang penempatannya.
        </p>
      </section>
      <section>
        <h2>Menu ⋮ di kanan pratinjau</h2>
        <ul>
          <li>Manual Tracking — klik orang/benda di video sumber; AI mengunci subjek, border mengikuti gerakannya, kamera mengikuti sepanjang adegan. Bisa subjek berbeda untuk adegan berbeda.</li>
          <li>Edit Transkrip — perbaiki kata salah tanpa mengubah waktu (karaoke tetap sinkron).</li>
          <li>Add Custom Logo (Premium) — pasang logo brand: hapus background otomatis, lalu seret & perbesar langsung di pratinjau.</li>
        </ul>
      </section>
      <section>
        <h2>Semua otomatis tersimpan</h2>
        <p>
          Setiap pengaturan — preset, ukuran, saklar ikon/b-roll/emoji/auto split, posisi logo —
          disimpan ke server secara berkelanjutan. Buka editor dari perangkat mana pun,
          pengaturan klip itu ikut.
        </p>
      </section>
      <section>
        <h2>Pratinjau besar & anti-zoom</h2>
        <p>
          Pratinjau memenuhi hampir seluruh tinggi layar (80% desktop / 72% ponsel) dan halaman
          dikunci dari zoom tak sengaja (pinch, ctrl+scroll) supaya tombol tidak pernah kehilangan posisi.
        </p>
      </section>
    </DocsShell>
  );
}
