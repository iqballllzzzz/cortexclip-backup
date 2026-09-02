# Sambung CortexClip ke Domain Baru (contoh: beli di gname.com)

Panduan ini khusus untuk VPS yang sekarang dipakai:

- IP publik VPS: **38.47.93.148**
- Domain lama: `clip.aqualibrya.my.id` (tetap bisa dipakai bersamaan)
- Web server: nginx (`/etc/nginx/sites-available/cortexclip`)
- SSL: certbot 2.9.0 (Let's Encrypt), sertifikat lama sudah ada
- Frontend Nitro di `127.0.0.1:8080`, backend FastAPI di `127.0.0.1:8787`,
  Supabase di `127.0.0.1:8000`

Ganti `DOMAINBARU.com` di seluruh panduan dengan domain yang kamu beli.

> Skrip `scripts/add-domain.sh` sudah diuji dengan `--dry-run`: ia menolak
> jalan kalau DNS belum mengarah ke `38.47.93.148`, mencadangkan konfigurasi
> nginx sebelum diubah, dan tidak menyentuh berkas apa pun dalam mode dry-run.

---

## 1. Arahkan DNS di gname.com

Masuk ke gname.com → **My Domains** → pilih domainmu → **DNS Management**
(atau **Manage DNS / DNS Records**).

Kalau nameserver domain masih diarahkan ke pihak lain, set dulu ke nameserver
gname (biasanya `ns1.gname.com` / `ns2.gname.com`) supaya panel DNS gname yang
dipakai. Lalu tambahkan dua record ini:

| Type | Host / Name | Value           | TTL |
|------|-------------|-----------------|-----|
| A    | `@`         | `38.47.93.148`  | 600 |
| A    | `www`       | `38.47.93.148`  | 600 |

Catatan penting:

- **Jangan** pakai record CNAME untuk `@` (root domain) — banyak DNS provider
  menolaknya dan bisa merusak email/MX.
- Kalau kamu hanya mau subdomain (mis. `clip.DOMAINBARU.com`), cukup satu
  record A dengan Host `clip`.
- Hapus record A/AAAA lama yang menunjuk ke IP lain kalau ada, supaya tidak
  bentrok.

Tunggu propagasi. Cek dari VPS:

```bash
dig +short DOMAINBARU.com @1.1.1.1
dig +short www.DOMAINBARU.com @1.1.1.1
```

Keduanya harus menjawab `38.47.93.148`. Biasanya 5–30 menit; bisa sampai
beberapa jam kalau TTL lama besar. **Jangan lanjut ke langkah 2 sebelum ini
benar** — certbot akan gagal kalau DNS belum mengarah ke VPS.

---

## 2. Jalankan skrip otomatis di VPS

Repo sudah menyediakan skrip yang mengerjakan sisanya: nginx vhost, sertifikat
SSL, update `.env` backend + frontend, update Supabase auth URL, rebuild
frontend, dan restart service.

```bash
cd /home/muhiqbalsukarno/cortexclip-backup
sudo bash scripts/add-domain.sh DOMAINBARU.com
```

Skrip ini **menambah** domain baru tanpa mematikan domain lama, jadi
`clip.aqualibrya.my.id` tetap hidup selama masa transisi.

Untuk melihat apa yang akan dikerjakan tanpa mengubah apa pun:

```bash
sudo bash scripts/add-domain.sh DOMAINBARU.com --dry-run
```

---

## 3. Kalau mau melakukannya manual

### 3a. Sertifikat SSL

```bash
sudo certbot --nginx -d DOMAINBARU.com -d www.DOMAINBARU.com \
  --non-interactive --agree-tos -m EMAILKAMU@example.com --redirect
```

Certbot otomatis menambahkan blok SSL ke nginx dan memasang perpanjangan
otomatis (timer systemd `certbot.timer`). Cek:

```bash
sudo certbot certificates
systemctl list-timers certbot.timer
```

### 3b. nginx

Edit `/etc/nginx/sites-available/cortexclip`, tambahkan domain baru ke kedua
`server_name` (blok port 80 dan blok port 443):

```nginx
server_name clip.aqualibrya.my.id DOMAINBARU.com www.DOMAINBARU.com _;
```

Lalu:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 3c. Env aplikasi

Empat nilai harus menunjuk ke domain baru, kalau tidak: gambar QRIS, tautan
hasil render, dan login akan tetap memakai domain lama.

`backend/.env`:

```
PUBLIC_SUPABASE_URL=https://DOMAINBARU.com
PUBLIC_BASE_URL=https://DOMAINBARU.com
```

`.env` (root, untuk frontend):

```
SUPABASE_URL=https://DOMAINBARU.com
VITE_SUPABASE_URL=https://DOMAINBARU.com
VITE_BACKEND_URL=https://DOMAINBARU.com
```

`VITE_*` dibaca **saat build**, jadi frontend wajib dibangun ulang:

```bash
cd /home/muhiqbalsukarno/cortexclip-backup
NITRO_PRESET=node-server npm run build
sudo systemctl restart cortexclip-frontend cortexclip-backend
```

### 3d. Supabase auth (link verifikasi & reset password)

`/home/muhiqbalsukarno/supabase-docker/docker/.env`:

```
SITE_URL=https://DOMAINBARU.com
API_EXTERNAL_URL=https://DOMAINBARU.com/auth/v1
SUPABASE_PUBLIC_URL=https://DOMAINBARU.com
ADDITIONAL_REDIRECT_URLS=https://clip.aqualibrya.my.id,https://DOMAINBARU.com
```

Terapkan:

```bash
cd /home/muhiqbalsukarno/supabase-docker/docker
sg docker -c "docker compose up -d"
```

`ADDITIONAL_REDIRECT_URLS` penting: tanpa itu, user yang mengklik link
verifikasi email dari domain lama akan ditolak.

---

## 4. Verifikasi

```bash
curl -sI https://DOMAINBARU.com | head -3
curl -s -o /dev/null -w "%{http_code}\n" https://DOMAINBARU.com/docs
curl -s -o /dev/null -w "%{http_code}\n" https://DOMAINBARU.com/api/premium/plans
```

Harapan: `200` untuk landing dan `/docs`, `200` untuk endpoint plans.
Lalu di browser: buat akun baru, cek email verifikasi mengarah ke domain baru,
proses satu video pendek, dan unduh satu klip.

---

## 5. Setelah domain baru stabil

1. **Google Search Console** — tambahkan properti domain baru, verifikasi
   (paling mudah lewat DNS TXT di gname), lalu submit
   `https://DOMAINBARU.com/sitemap.xml`.
2. Update `SITE_URL` di `src/lib/seo-jsonld.ts` dan URL di
   `public/sitemap.xml` + `public/robots.txt` ke domain baru, lalu build ulang.
   Ini yang membuat JSON-LD, canonical, dan sitemap konsisten — penting untuk
   pencarian nama brand.
3. Kalau domain lama akan ditinggalkan, jangan langsung dihapus. Biarkan
   nginx tetap menerimanya dan tambahkan redirect 301 permanen supaya
   peringkat pencarian pindah:

```nginx
server {
    listen 443 ssl http2;
    server_name clip.aqualibrya.my.id;
    ssl_certificate     /etc/letsencrypt/live/clip.aqualibrya.my.id/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/clip.aqualibrya.my.id/privkey.pem;
    return 301 https://DOMAINBARU.com$request_uri;
}
```

---

## Masalah yang sering terjadi

| Gejala | Penyebab |
|---|---|
| `certbot` gagal: "Timeout during connect" | DNS belum mengarah ke 38.47.93.148, atau port 80 tertutup firewall |
| Domain baru terbuka tapi login gagal | `SITE_URL` / `API_EXTERNAL_URL` Supabase masih domain lama |
| QRIS tidak muncul | `PUBLIC_BASE_URL` di `backend/.env` masih domain lama |
| Halaman tampil tapi API 404 | Frontend belum di-build ulang setelah `VITE_BACKEND_URL` diubah |
| Sertifikat kedaluwarsa | `certbot.timer` mati — `sudo systemctl enable --now certbot.timer` |
