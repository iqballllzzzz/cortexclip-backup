# Perbaikan pipeline CortexClip agar stabil dan dapat dipakai

## Tujuan
Membuat alur unggah, transkripsi, deteksi klip, preview karaoke, dan ekspor lebih andal—terutama di ponsel dan untuk video besar—serta memverifikasi setiap jalur yang dapat diuji di preview.

## Implementasi
1. **Perbaiki kegagalan backend dan AI**
   - Hilangkan ketergantungan server function pada konfigurasi backend yang salah/absen dengan memastikan token pengguna diteruskan dan konfigurasi runtime dibaca di boundary server yang benar.
   - Ganti autentikasi Lovable AI Gateway ke header yang benar dan gunakan model/endpoint yang sesuai: speech-to-text khusus untuk transkripsi, `openai/gpt-5.6-sol` untuk analisis klip.
   - Tambahkan validasi respons, error Indonesia yang spesifik (kredit, rate limit, format media, payload), dan retry terbatas hanya untuk 429/5xx.

2. **Stabilkan video besar dan progres nyata**
   - Ganti unggahan satu kali dengan unggahan resumable/chunked serta progres byte real-time, dukungan batal, dan pemulihan status proyek bila upload gagal.
   - Hindari mengunduh ulang video setelah upload bila file lokal tersedia; minta pemilihan ulang file secara jelas saat browser tidak lagi memegang file.
   - Kurangi ukuran potongan audio agar request aman, proses satu per satu, simpan checkpoint transkrip per bagian, dan tampilkan tahap/persentase aktual agar proses dapat dilanjutkan setelah kegagalan.
   - Beri pemeriksaan kompatibilitas/kapasitas sebelum decode sehingga ponsel tidak crash diam-diam pada file yang terlalu besar.

3. **Preview editor yang benar**
   - Hubungkan video sumber asli ke preview klip.
   - Tambahkan timeline/scrubber dengan playhead, rentang awal–akhir, waktu aktif, dan karaoke word-highlight sinkron terhadap waktu video (bukan simulasi terpisah).

4. **Ekspor video otomatis di browser**
   - Tambahkan ekspor WebM aktual untuk klip terpilih dengan crop vertikal/tengah dan caption karaoke yang dibakar ke canvas, lengkap dengan progres render dan tombol batal.
   - Pertahankan ekspor SRT/ASS/FFmpeg sebagai opsi kualitas tinggi/offline; label “face tracking” diperbaiki agar tidak mengklaim deteksi wajah bila implementasinya baru crop tengah.

5. **Verifikasi**
   - Uji upload resumable/progress dengan file media sintetis besar, kegagalan dan retry, serta status proyek.
   - Jalankan request transkripsi dan analisis nyata melalui jalur aplikasi, lalu cek hasil klip tersimpan.
   - Uji preview timeline/karaoke dan ekspor video di browser; periksa file hasil dengan `ffprobe`.
   - Uji tampilan desktop dan mobile serta cek console/network tanpa error.

## Batasan jujur
- Lovable AI sudah menyediakan key gateway, jadi pengguna **tidak perlu** mengirim Groq/Gemini API key.
- AI memilih momen viral dan metadata. Deteksi wajah dinamis yang setara OpusClip memerlukan model vision/video atau worker render khusus; versi tanpa biaya akan menyediakan crop tengah yang jujur, bukan mengklaim face tracking palsu.
- Ekspor otomatis browser menghasilkan WebM dan berjalan selama durasi klip. Ekspor H.264/MP4 kualitas produksi tetap melalui paket FFmpeg yang dapat diunduh, karena server edge tidak dapat menjalankan FFmpeg.
