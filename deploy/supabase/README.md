# Verifikasi email pendaftaran (kode 6 digit)

Pengirim: `kvcs@cortexclip.eu.cc` · Subjek: "Kode verifikasi CortexClip"

## Cara kerjanya

1. Pengguna mendaftar di `/auth`.
2. GoTrue mengirim email berisi **kode 6 angka** (template: `konfirmasi.html`).
3. Halaman `/auth` menampilkan kolom kode. Sebelum kode dimasukkan, login
   **ditolak server** dengan `email_not_confirmed` — akun benar-benar belum
   bisa dipakai, bukan hanya disembunyikan di UI.
4. Kode benar → `verifyOtp` mengisi `email_confirmed_at` → sesi aktif.

Kunci di sisi server: `ENABLE_EMAIL_AUTOCONFIRM=false`. Selama ini nilainya
`true`, jadi setiap akun langsung dianggap terverifikasi tanpa pernah membuka
email.

## Berkas

| Berkas | Isi |
|---|---|
| `email-verifikasi.env` | Salinan variabel email dari `supabase-docker/docker/.env` (nilai rahasia dikosongkan) |
| `konfirmasi.html` | Template email; sumbernya `public/email/konfirmasi.html` yang disajikan di `https://cortexclip.eu.cc/email/konfirmasi.html` |

GoTrue v2.189 memuat template lewat **HTTP**, bukan path berkas di container —
karena itu `MAILER_TEMPLATE_CONFIRMATION_URL` menunjuk ke URL publik, dan
templatenya ikut ter-deploy bersama frontend.

## PENTING: email belum sampai ke inbox pengguna

Saat ini email berhenti di **Mailpit** (penampung lokal, UI di
`http://127.0.0.1:8025`). Alur, template, kode, dan pemblokiran login sudah
terverifikasi bekerja, tetapi pengguna sungguhan **belum menerima apa pun**
sampai relay SMTP diisi.

Untuk mengaktifkan pengiriman nyata:

1. Daftar penyedia SMTP (Resend / Brevo / Mailgun — port 587 terbuka di VPS
   ini; port 25 diblokir, jadi relay wajib lewat 587).
2. Verifikasi domain `cortexclip.eu.cc` di penyedia: tambahkan record **SPF**
   dan **DKIM** yang mereka berikan. Tanpa ini email ditolak atau masuk spam.
   Domain ini belum punya MX/TXT sama sekali (sudah diperiksa dengan `dig`).
3. Isi di `supabase-docker/docker/.env`:

   ```
   MP_SMTP_RELAY_HOST=smtp.resend.com
   MP_SMTP_RELAY_USERNAME=resend
   MP_SMTP_RELAY_PASSWORD=<API key>
   MP_SMTP_RELAY_ALL=true
   ```

   `MP_SMTP_RELAY_ALL=true` tanpa `MP_SMTP_RELAY_HOST` membuat Mailpit
   crash-loop — isi host lebih dulu.

4. `docker compose up -d mail`
5. Jalankan `backend/e2e-verifikasi.py`; tambahkan pemeriksaan bahwa email
   benar-benar terkirim (log Mailpit menampilkan hasil relay).

## Uji

`backend/e2e-verifikasi.py` — 23 pemeriksaan terhadap produksi: signup tidak
memberi sesi, email terkirim dengan pengirim dan subjek yang benar, kode 6
digit terbaca dari isi email, login ditolak sebelum verifikasi
(`email_not_confirmed`), verifikasi memberi sesi, login berhasil sesudahnya,
kode ngawur ditolak, akun uji dibersihkan.
