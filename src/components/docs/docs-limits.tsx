import { Sec, Sub, P, UL, Rows, Note, K } from "./docs-ui";

/** Bagian 3: batas pemakaian, harga, waktu proses. */
export function DocsLimits() {
  return (
    <>
      <Sec id="batas" title="Batas pemakaian & peraturan">
        <Rows
          head={["", "Gratis", "Premium"]}
          rows={[
            ["Video panjang per hari", "2", "10"],
            ["Klip maksimal per video", "10", "40"],
            ["Resolusi unduhan", "720×1280", "720×1280"],
            ["Watermark", "Ada (hilang setelah 4 iklan)", "Tidak ada"],
            ["Durasi video sumber", "Tidak dibatasi", "Tidak dibatasi"],
          ]}
        />
        <P>
          Hitungan “per hari” memakai tanggal UTC dan direset otomatis. Yang dihitung adalah video
          yang <i>diproses</i>, bukan jumlah klip yang diunduh — kamu boleh mengunduh dan merender
          ulang klip yang sama sebanyak yang kamu mau.
        </P>

        <Sub title="Peraturan pemakaian">
          <UL
            items={[
              "Unggah hanya video yang kamu punya haknya, atau yang lisensinya mengizinkan.",
              "Dilarang mengunggah konten yang melanggar hukum Indonesia: pornografi, ujaran kebencian, kekerasan grafis, penipuan.",
              "Satu akun untuk satu orang. Membuat banyak akun untuk menembus batas harian bisa berujung pemblokiran.",
              "Jangan mengotomasi/menembak API di luar antarmuka web — ada pembatasan laju di server.",
              "Berkas sumber dan hasil render disimpan di server. Hapus project bila ingin menghapus datanya.",
            ]}
          />
        </Sub>

        <Sub title="Harga Premium">
          <Rows
            head={["Paket", "Durasi", "Harga"]}
            rows={[
              ["1 Hari", "1 hari", "Rp3.000"],
              ["5 Hari", "5 hari", "Rp8.000"],
              ["1 Bulan", "30 hari", "Rp25.000"],
              ["1 Tahun", "365 hari", "Rp210.000"],
            ]}
          />
          <P>
            Pembayaran memakai QRIS, jadi bisa dari aplikasi bank atau e-wallet apa pun. Premium
            aktif otomatis beberapa detik setelah pembayaran terdeteksi — tidak perlu konfirmasi
            manual.
          </P>
          <Note tone="warn">
            QRIS punya masa berlaku. Di bawah gambar QRIS ada hitungan waktu; bila habis, QRIS
            kadaluarsa dan kamu perlu membuat pesanan baru. Jangan membayar dengan QRIS yang sudah
            kadaluarsa.
          </Note>
        </Sub>
      </Sec>

      <Sec id="lama" title="Perkiraan lama proses">
        <P>
          Angka di bawah diukur di server yang sedang dipakai sekarang (4 CPU). Bila ada beberapa
          pengguna merender bersamaan, job masuk antrean dan waktunya bertambah.
        </P>
        <Rows
          head={["Panjang video", "Transkripsi + analisis", "Total sampai klip siap"]}
          rows={[
            ["10 menit", "sekitar 1 menit", "1–2 menit"],
            ["30 menit", "1–2 menit", "2–4 menit"],
            ["1 jam", "2–4 menit", "4–7 menit"],
            ["2–3 jam", "5–10 menit", "8–15 menit"],
          ]}
        />
        <Rows
          head={["Tindakan", "Waktu terukur"]}
          rows={[
            ["Preview klip di editor", "3–20 detik (tidak tergantung panjang video sumber)"],
            ["Render 1 klip untuk diunduh", "100–250 detik, rata-rata sekitar 150 detik"],
          ]}
        />
        <P>
          Render tidak melambat hanya karena video sumbernya panjang: hanya potongan klip yang
          diambil dari storage, bukan seluruh berkas. Video 1 jam berukuran 909 MB hanya perlu
          menarik sekitar 14 MB untuk satu klip.
        </P>
        <Note>
          Semua proses berjalan di server. Kamu boleh menutup tab, keluar dari situs, atau mematikan
          perangkat — transkripsi, analisis, dan render tetap berjalan sampai selesai.
        </Note>
      </Sec>
    </>
  );
}
