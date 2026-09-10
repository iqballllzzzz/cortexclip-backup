# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React 19 + TanStack Start + TanStack Router (file-based routes) · Vite 8 · Tailwind CSS v4 · Radix UI · Motion · Three.js · Supabase (Postgres + Auth + Storage) · Nitro backend server · FastAPI Python backend (ML/render pipeline) · Bun runtime · Deployed on VPS (Nginx reverse proxy) · Production domains: cortexclip.eu.cc, clip.aqualibrya.my.id

## Users

**Kreator konten, podcaster, dan tim media/agency di Indonesia** yang perlu memproduksi puluhan klip pendek viral (TikTok, Instagram Reels, YouTube Shorts) setiap hari dari video panjang — tanpa harus membuang waktu berjam-jam di software editing konvensional seperti Premiere Pro atau CapCut Desktop.

Secondary audience: content agency yang mengerjakan klien, UKM dan brand lokal yang butuh konten video tanpa video editor fulltime.

## Product Purpose

CortexClip mengubah video panjang dari YouTube (podcast, webinar, ceramah, konten edukasi) menjadi klip vertikal 9:16 siap upload, lengkap dengan:
- Subtitle karaoke otomatis per kata (sub-second accuracy)
- Smart auto-reframe berbasis face tracking (MediaPipe FaceMesh)
- Skor viralitas berbasis analisis hook 3 detik & retensi
- Auto-split podcast dua pembicara
- Custom brand overlay (logo, warna, font)
- B-roll insertion otomatis
- Download MP4 vertikal langsung dari dashboard

Sukses berarti: kreator upload satu video panjang, keluar 5–15 klip siap posting dalam hitungan menit, tanpa menyentuh timeline editing.

## Positioning

Alternatif OpusClip yang lebih terjangkau, lokal, dan fleksibel untuk pasar Indonesia:

1. **Harga yang sangat terjangkau:** Akses 1 hari Rp5.000 · 5 hari Rp19.000 · 1 bulan Rp89.000 · 1 tahun Rp299.000 (vs OpusClip ±Rp240.000–Rp464.000/bulan). Pembayaran via QRIS instan, seluruh e-wallet Indonesia, tanpa kartu kredit luar negeri.
2. **Bebas watermark 100%** di semua paket berbayar.
3. **Akses gratis via rewards iklan** — tidak ada paywall keras untuk trial.
4. **Optimasi Bahasa Indonesia** (dan multi-bahasa via i18n): STT Whisper dengan alignment waktu sub-kata akurasi tinggi untuk intonasi dan istilah lokal.
5. **Studio kontrol penuh:** Manual tracking editor, auto-split podcast, custom logo overlay, dan kontrol render yang tidak tersedia di kompetitor SaaS internasional.

## Operating Context

- Pengguna membuka dashboard dari HP atau laptop, paste URL YouTube, pilih model STT, tunggu pipeline render, lalu download atau share klip langsung.
- Workflow tipis: Landing → Auth (OTP email 6 digit) → Dashboard (input URL) → Projects → Editor per klip → Download/Unduh.
- Pipeline berjalan di server VPS (GPU/CPU); user tidak perlu install apapun.
- CS via WhatsApp: wa.me/6285183317385. Komunitas official: chat.whatsapp.com/EQBUHFIuOTG4ziEGLWhZG5.
- Ban/suspend: layar banned dengan CTA prefill ke WA CS dengan email, alasan, dan account ID.
- Admin panel terpisah untuk monitoring user, pipeline, dan model health.

## Capabilities and Constraints

**Fitur utama yang dikonfirmasi:**
- Smart Auto-Reframe: FaceMesh tracking wajah, geometri panel bersih (geser dulu, zoom maks 1.55x), anti-bocor frame
- Sub-Second Karaoke Subtitle: render ASS, alignment Fontsize em-ke-px, WrapStyle 0, auto-split per klip off by default
- Virality Score Engine: analisis hook 3 detik, skor retensi estimasi
- Auto-Split Multi-Person: deteksi 2 pembicara, format podcast
- B-roll overlay: jadwal ikon + B-roll (+0.55s), overlay_plan dari broll_api
- Custom Logo/Brand: upload logo PNG, posisi, ukuran
- Download MP4: riwayat klip di halaman Unduh, hapus dari server, concurrent download 1 aktif

**STT Pipeline (prioritas failover):** Groq → Gemini native → HF Whisper → faster-whisper → aidictation (last resort). STT_PARALLEL=3.

**Video Downloader:** YouTube (savetube → ytdl-rapid → Piped proxy) · X/Twitter (densave multipart) · TikTok (vibetik) · Instagram (aio-rapidapi).

**Autentikasi:** Email OTP 6 digit via Resend (ENABLE_EMAIL_AUTOCONFIRM=false). Domain verified: aqualibrya.my.id. Tanpa magic link/password.

**Keamanan:** RLS profiles dimigrasi (20260905_tutup_eskalasi_hak.sql). Rate limiting via Nginx conf.d/cortexclip-ratelimit.conf. QRIS sweep 5 menit, expiry 60 menit.

**Constraints:**
- Render berjalan di VPS tunggal — kapasitas terbatas oleh memori GPU/CPU server
- Subtitle font: self-hosted, SAMA file antara frontend dan backend untuk konsistensi render
- Pipeline auto_split WAJIB emit lapor(18, 32) + visualPct smoother (tidak boleh beku di 1%)
- Parent route docs.tsx WAJIB render `<Outlet />`

## Brand Commitments

- **Nama produk:** CortexClip (juga disebut CortexClip AI di beberapa copy)
- **Visual world:** Cinema Dark Studio — obsidian canvas (#0c0d10), solar amber accent (#f59e0b), Space Grotesk display, DM Sans body, Three.js WebGL 3D
- **Aset logo:** `public/cortexclip-logo.png`, `public/logo-dark.png`, `public/watermark-logo.png`, `public/favicon.png`
- **Tone of voice:** Tegas, teknikal, percaya diri. Tidak marketing-y atau lebay. Copy berbahasa Indonesia, teknikal tapi mudah dipahami kreator non-teknis.
- **Anti-pattern yang dilarang keras:** Titik-titik partikel kasar/grainy, gradient text palsu, blur orb dekorasi, cards inside cards tanpa makna, AI-slop generic. Target skor anti-slop < 5 (0 lebih baik).
- **Mobile-first smoothness:** Wajib halus di HP low-end — pixelRatio clamp, pause saat offscreen, budget ketat untuk animasi WebGL.

## Evidence on Hand

- Codebase lengkap di `/home/muhiqbalsukarno/cortexclip-backup/` (frontend React + backend FastAPI)
- Screenshot produksi di `~/bukti-tampilan-cortexclip.png`
- Sitemap dan routes: Landing, Auth, Dashboard, Projects, Editor, Download/Unduh, Admin, Docs (mulai-cepat, harga, editor, keamanan, manual-tracking, custom-logo, batas, masalah, what-is-cortexclipai)
- Docs harga: dikonfirmasi di `src/routes/docs/harga.tsx`
- Tidak ada testimonial atau case study nyata yang terdokumentasi — jangan fabrikasi.
- Tidak ada data retention/churn nyata — jangan fabrikasi.

## Product Principles

1. **Waktu kreator adalah aset.** Setiap langkah yang hilang dari workflow adalah keunggulan nyata. Otomasi bukan fitur — otomasi adalah produknya.
2. **Lokal bukan inferior.** Harga QRIS, STT Bahasa Indonesia, CS via WA — produk yang benar-benar dibuat untuk ekosistem kreator Indonesia, bukan port dari produk Barat.
3. **Kontrol tanpa kerumitan.** Kreator bisa masuk dan keluar dengan cepat (mode otomatis) atau menyentuh setiap detail (mode editor). Keduanya harus sama-sama cepat.
4. **Kualitas output = bukti produk.** Klip yang keluar harus sudah layak upload — framing tepat, subtitle terbaca, tanpa watermark. User tidak boleh perlu edit ulang.
5. **Keamanan dan kepercayaan non-negosiabel.** RLS yang ketat, OTP, rate limit, dan transparansi harga adalah fondasi — bukan fitur premium.

## Accessibility & Inclusion

- Target perangkat: HP Android mid-low (≤4GB RAM), koneksi 4G stabil
- Interface bahasa Indonesia (i18n tersedia: id, en; file di `src/lib/dict/`)
- Tidak ada dokumen persyaratan aksesibilitas formal (WCAG level) yang dikonfirmasi — area terbuka
