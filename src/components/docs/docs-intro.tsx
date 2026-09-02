import { Sec, Sub, P, UL, OL, Rows, Note, K } from "./docs-ui";

/** Bagian 1: apa itu CortexClip, cara pakai, dan alur kerjanya. */
export function DocsIntro() {
  return (
    <>
      <Sec id="apa-itu" title="Apa itu CortexClip">
        <P>
          CortexClip mengubah satu video panjang — podcast, ceramah, webinar, siaran gaming, atau
          video komedi — menjadi beberapa klip vertikal 9:16 yang siap diunggah ke TikTok, Instagram
          Reels, dan YouTube Shorts. Seluruh proses berjalan di server: kamu cukup mengunggah video
          atau menempel tautan, lalu menunggu hasilnya.
        </P>
        <P>Yang dikerjakan otomatis untuk tiap klip:</P>
        <UL
          items={[
            "Transkripsi kata-per-kata (word-level) sebagai dasar subtitle karaoke.",
            "Pemilihan momen berpotensi viral, bukan potongan acak.",
            "Reframing 9:16 dengan face tracking yang mengikuti orang yang sedang bicara.",
            "Subtitle terbakar (burned-in) dengan gaya yang bisa kamu atur.",
            "Judul, deskripsi, dan hashtag yang menyesuaikan isi klip dan genrenya.",
            "Opsional: ikon, emoji, dan b-roll yang relevan dengan yang sedang dibicarakan.",
          ]}
        />
      </Sec>

      <Sec id="mulai" title="Cara pakai — dari nol sampai file terunduh">
        <OL
          items={[
            <>
              <b className="text-foreground">Buat akun.</b> Daftar dengan email dari halaman{" "}
              <K>/auth</K>. Verifikasi email bila diminta, lalu kamu masuk ke Dashboard.
            </>,
            <>
              <b className="text-foreground">Masukkan video.</b> Di Dashboard ada dua jalur: unggah
              berkas dari perangkat, atau tempel tautan video (YouTube dan sejenisnya). Format yang
              diterima: berkas video atau audio apa pun yang bisa dibaca ffmpeg (mp4, mov, mkv,
              webm, mp3, m4a, wav).
            </>,
            <>
              <b className="text-foreground">Tunggu proses.</b> Status project berjalan berurutan:{" "}
              <K>downloading</K> → <K>transcribing</K> → <K>analyzing</K> → <K>completed</K>. Kamu
              boleh menutup halaman atau mematikan perangkat — proses berjalan di server, bukan di
              browser.
            </>,
            <>
              <b className="text-foreground">Buka klip di editor.</b> Setiap klip punya skor
              viralitas, judul, deskripsi, dan hashtag. Di editor kamu bisa mengganti gaya subtitle,
              ukuran font, posisi, dan menyalakan ikon/b-roll/emoji.
            </>,
            <>
              <b className="text-foreground">Tekan Unduh.</b> Render berjalan di latar belakang.
              Hasilnya muncul di halaman <K>/unduh</K> — boleh ditinggal, tidak akan hilang.
            </>,
          ]}
        />
        <Note>
          Nama berkas unduhan diambil dari <b>judul klip</b>, jadi tiap klip punya nama berbeda —
          bukan nama project. Contoh: <K>Rambut-Mulet-vs-Rambut-Messi-Jangan-Salah-Pilih.mp4</K>.
        </Note>
      </Sec>

      <Sec id="alur" title="Apa yang terjadi di dalam (alur teknis)">
        <P>
          Mengetahui alurnya membantu kamu menebak di mana proses sedang berada bila terasa lama.
        </P>
        <Rows
          head={["Tahap", "Yang dikerjakan"]}
          rows={[
            ["Unduh / unggah", "Video disimpan ke storage server. Tautan diunduh dengan beberapa downloader berurutan sampai satu berhasil."],
            ["Ekstraksi audio", "Audio dipisah jadi WAV mono 16 kHz, lalu dipotong per 10 menit."],
            ["Transkripsi", "Potongan dikirim paralel ke rantai penyedia STT sampai ada yang berhasil. Hasilnya waktu mulai/selesai per kata."],
            ["Deteksi genre", "Transkrip dipakai menentukan genre video (13 genre) — dasar pemilihan ikon, b-roll, dan gaya metadata."],
            ["Penilaian momen", "Transkrip dibagi menjadi jendela 60 detik bertumpuk, tiap jendela dinilai potensi viralnya."],
            ["Penentuan batas klip", "Kandidat terbaik diperiksa lagi untuk menetapkan awal/akhir tepat di batas kalimat, plus judul, deskripsi, dan hashtag."],
            ["Render", "Segmen klip diambil dari storage, di-reframe 9:16 dengan face tracking, subtitle dan overlay dibakar, lalu diunggah sebagai MP4."],
          ]}
        />
      </Sec>
    </>
  );
}
