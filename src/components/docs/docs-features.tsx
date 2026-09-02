import { Sec, Sub, P, UL, Rows, Note, K } from "./docs-ui";

/** Bagian 2: penjelasan fitur satu per satu. */
export function DocsFeatures() {
  return (
    <>
      <Sec id="fitur" title="Fitur, satu per satu">
        <Sub title="Pemilihan klip berpotensi viral">
          <P>
            Sistem tidak memotong video setiap 60 detik. Transkrip dinilai dengan kriteria yang
            dipakai editor short-form: kekuatan hook 3 detik pertama, apakah klip berisi satu ide
            utuh, apakah bisa dipahami tanpa menonton video aslinya, dan apakah ada penutup.
          </P>
          <P>
            Di atas penilaian itu ada penyaring isi: sapaan pembuka, iklan/sponsor, dan basa-basi
            diturunkan skornya. Klip dengan skor akhir di bawah 25 dibuang. Karena itu jumlah klip
            bisa lebih sedikit dari yang kamu harapkan — itu memang disengaja.
          </P>
        </Sub>

        <Sub title="Subtitle karaoke">
          <P>
            Subtitle dibuat dari transkrip kata-per-kata, jadi kata yang sedang diucapkan menyala
            tepat pada waktunya. Tersedia 10 preset gaya:
          </P>
          <UL
            items={[
              <><K>hormozi</K> — kata aktif bertumpu kotak warna, tebal, gaya iklan.</>,
              <><K>mrbeast</K> — huruf besar, stroke tebal, kontras tinggi.</>,
              <><K>tiktok</K> — bersih, netral, cocok untuk semua konten.</>,
              <><K>neon</K> — sorot warna cerah dengan glow.</>,
              <><K>minimal</K> — tipis, tanpa hiasan.</>,
              <><K>comic</K> — huruf bulat, cocok untuk komedi.</>,
              <><K>podcast</K> — elegan, ukuran sedang, mudah dibaca.</>,
              <><K>typewriter</K> — kata muncul satu-satu.</>,
              <><K>gaming</K> — tajam, warna kontras.</>,
              <><K>default</K> — dasar netral.</>,
            ]}
          />
          <P>
            Di editor kamu bisa mengubah ukuran font, posisi vertikal, dan opasitas. Yang kamu lihat
            di preview adalah yang terbakar ke video: server memakai rumus ukuran dan posisi yang
            sama dengan browser.
          </P>
        </Sub>

        <Sub title="Face tracking (reframe 9:16)">
          <P>
            Video landscape dipotong ke 9:16, jadi harus diputuskan bagian mana yang dipertahankan.
            Sistem mendeteksi semua wajah, mengelompokkannya per orang, lalu mengukur gerak mulut
            untuk menebak siapa yang sedang bicara.
          </P>
          <UL
            items={[
              "Orang yang sama bergerak — kamera mengikuti halus, tanpa lompat.",
              "Pembicara berganti — kamera langsung berpindah (potong keras, bukan menggeser perlahan).",
              "Wajah tertutup mikrofon lalu muncul lagi tidak dianggap orang baru, jadi kamera tidak ikut memotong.",
              "Jeda minimal antar perpindahan 1,5 detik supaya kamera tidak bolak-balik.",
            ]}
          />
        </Sub>

        <Sub title="Ikon, emoji, dan b-roll (opsional)">
          <P>
            Bisa dinyalakan di editor. Sistem memilih momen paling kuat, lalu menempelkan ikon
            berwarna, emoji pada kata kunci, dan jendela b-roll (footage stok) yang relevan dengan
            genre video.
          </P>
          <Rows
            head={["Aset", "Jumlah", "Sumber"]}
            rows={[
              ["Ikon", "507 varian (39 gambar × 13 warna)", "Digambar sendiri, sama persis antara preview dan hasil"],
              ["B-roll", "501 klip", "Mixkit, bebas dipakai, sudah ber-tag kategori & genre"],
              ["Emoji", "Twemoji", "Dipetakan dari kata kunci di subtitle"],
            ]}
          />
          <Note>
            Rencana penempatan disimpan sekali. Kalau kamu tidak suka hasilnya, tekan{" "}
            <b>“Cari ikon &amp; b-roll lain”</b> di editor. Tanpa tombol itu, rencananya tidak
            berubah — supaya preview dan hasil unduhan selalu sama.
          </Note>
        </Sub>

        <Sub title="Genre otomatis">
          <P>
            Genre dideteksi dari transkrip dan menentukan ikon, b-roll, emoji, serta nada
            judul/deskripsi/hashtag. Genre yang dikenali: komedi, bisnis, teknologi, edukasi,
            olahraga, kuliner, travel, musik, gaming, kesehatan, motivasi, drama, dan lifestyle.
          </P>
        </Sub>

        <Sub title="Watermark">
          <P>
            Klip gratis membawa watermark CortexClip (logo transparan, nama, dan tagline — tanpa
            kotak hitam). Watermark hilang setelah kamu menuntaskan 4 iklan, atau bagi pengguna
            Premium.
          </P>
        </Sub>
      </Sec>
    </>
  );
}
