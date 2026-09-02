import { Sec, Sub, P, UL, Rows, Note, K } from "./docs-ui";

/** Bagian 4: tips hasil bagus, masalah umum, dan FAQ. */
export function DocsHelp() {
  return (
    <>
      <Sec id="tips" title="Tips supaya hasilnya bagus">
        <UL
          items={[
            "Audio jernih lebih penting dari kualitas gambar. Transkrip yang salah membuat subtitle dan pemilihan klip ikut salah.",
            "Video dengan pembicara yang menghadap kamera memberi hasil face tracking terbaik. Video dengan banyak potongan cepat sulit dilacak.",
            "Untuk podcast dua orang, pastikan keduanya terlihat di frame — kamera baru bisa berpindah kalau wajahnya terdeteksi.",
            "Buka editor dan atur gaya subtitle sebelum menekan Unduh. Mengubah gaya setelah render berarti render ulang.",
            "Nyalakan ikon dan b-roll untuk konten yang banyak bicara (podcast, edukasi). Untuk konten yang visualnya sudah padat, sering lebih baik dimatikan.",
            "Kalau hanya sedikit klip yang keluar, itu berarti banyak bagian video dinilai basa-basi. Coba video dengan isi yang lebih padat.",
          ]}
        />
      </Sec>

      <Sec id="masalah" title="Masalah umum & penyebabnya">
        <Rows
          head={["Gejala", "Penyebab & solusi"]}
          rows={[
            [
              "Preview tidak muncul",
              "Preview dirender di server dan biasanya siap dalam beberapa detik. Bila lebih dari satu menit, muat ulang halaman — status preview tersimpan, tidak dimulai dari nol.",
            ],
            [
              "Klip lebih sedikit dari yang diharapkan",
              "Penyaring kualitas membuang bagian basa-basi, sapaan, dan iklan. Ini disengaja agar hasil tetap layak unggah.",
            ],
            [
              "Subtitle salah kata",
              "Transkripsi mengikuti kejelasan audio. Perbaiki di editor sebelum merender.",
            ],
            [
              "Kamera menyorot orang yang salah",
              "Deteksi pembicara memakai gerak mulut. Bila mulut tertutup mikrofon atau tangan, tebakan bisa keliru selama sekitar setengah detik.",
            ],
            [
              "Render terasa lama",
              "Server membatasi jumlah render bersamaan agar situs tetap responsif. Job berikutnya masuk antrean, bukan gagal.",
            ],
            [
              "QRIS tidak bisa dibayar",
              "Kemungkinan sudah kadaluarsa. Tutup dialog, buka lagi, dan buat pesanan baru.",
            ],
            [
              "Premium belum aktif setelah bayar",
              "Sistem memeriksa status pembayaran tiap beberapa detik. Bila lewat 2 menit belum aktif, muat ulang halaman — status diperiksa ulang ke penyedia pembayaran.",
            ],
          ]}
        />
      </Sec>

      <Sec id="faq" title="Pertanyaan yang sering muncul">
        <Sub title="Apakah preview benar-benar sama dengan hasil unduhan?">
          <P>
            Ya. Ukuran font, posisi subtitle, ikon, emoji, dan b-roll memakai rumus dan berkas yang
            sama. Ikon yang tampil di preview diambil dari server — berkas yang sama persis yang
            dibakar ke video.
          </P>
        </Sub>
        <Sub title="Bahasa apa saja yang didukung?">
          <P>
            Bahasa Indonesia dan Inggris paling akurat. Bahasa lain ikut dikenali karena model
            transkripsinya multibahasa, tapi kualitas subtitle bisa menurun.
          </P>
        </Sub>
        <Sub title="Berapa panjang maksimal video?">
          <P>
            Tidak ada batas keras. Video berjam-jam ditangani dengan memecah audio dan menilai
            transkrip secara bertahap. Yang membatasi hanya waktu proses dan ruang penyimpanan
            server.
          </P>
        </Sub>
        <Sub title="Apakah video saya dipakai untuk hal lain?">
          <P>
            Tidak. Berkas dipakai hanya untuk memproses klipmu, tersimpan di storage akunmu, dan
            terhapus ketika kamu menghapus project.
          </P>
        </Sub>
        <Sub title="Bisakah saya merender klip yang sama dua kali?">
          <P>
            Bisa, dan tidak memakan kuota harian. Kuota hanya dihitung saat memproses video baru.
          </P>
        </Sub>
        <Sub title="Kenapa resolusinya 720p, bukan 1080p?">
          <P>
            720×1280 dipilih supaya berkas lebih ringan diunggah ke media sosial dan render lebih
            cepat. Platform short-form juga mengompres ulang video yang diunggah, jadi bedanya
            hampir tidak terlihat.
          </P>
        </Sub>
        <Sub title="Butuh bantuan?">
          <P>
            Kirim email ke{" "}
            <a href="mailto:cs@cortexclip.app" className="font-medium text-accent hover:underline">
              cs@cortexclip.app
            </a>{" "}
            dengan menyebutkan ID project atau ID klip supaya lebih cepat ditelusuri.
          </P>
        </Sub>
      </Sec>
    </>
  );
}
