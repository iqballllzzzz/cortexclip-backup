# PANDUAN PEMULIHAN & INSTALASI VM BARU (DISASTER RECOVERY)

Dokumen ini adalah cetak biru teknis lengkap agar AI Agent atau administrator di masa mendatang dapat membangun kembali sistem **CortexClip SaaS** dari nol di VPS/VM baru (Ubuntu 22.04 / 24.04 LTS) hingga siap pakai 100%.

---

## 1. Opsi A: Instalasi Otomatis Satu Perintah (Skrip Mandiri)

Jika VM baru sudah terhubung internet, cukup jalankan skrip otomatis yang sudah disiapkan:

```bash
git clone https://github.com/iqballllzzzz/cortexclip-backup.git cortexclip-backup
cd cortexclip-backup
chmod +x setup-fresh-vm.sh
./setup-fresh-vm.sh cortexclip.eu.cc
```

Skrip `setup-fresh-vm.sh` akan:
1. Memasang paket Ubuntu (Python 3.11, ffmpeg, libass, git, docker, nginx, dll).
2. Mengalokasikan 4GB Swapfile agar server aman dari OOM Killer saat rendering video.
3. Memasang Bun (`~/.bun/bin/bun`) dan Rclone (`~/.local/bin/rclone`).
4. Menyiapkan kontainer Docker Supabase Self-Hosted (Kong, GoTrue, PostgREST, PostgreSQL, Storage).
5. Menerapkan skema database lengkap (`supabase/schema.sql`) dan membuat storage bucket (`video-uploads`, `brand-assets`).
6. Menyiapkan Python virtualenv backend (`backend/.venv`) dan menginstal seluruh pustaka.
7. Membangun bundle frontend produksi TanStack Start (`NITRO_PRESET=node-server bun run build`).
8. Memasang unit systemd (`cortexclip-backend`, `cortexclip-frontend`) dan Nginx reverse-proxy.

---

## 2. Opsi B: Memulihkan dari Cadangan Google Drive (Restore dari Backup 6 Jam)

Cadangan otomatis diunggah tiap 6 jam ke folder remote `gdrive:CortexClip-Backup/`.

### Langkah Pemulihan:
1. Salin konfigurasi Rclone:
   ```bash
   mkdir -p ~/.config/rclone
   # Buat atau salin token Google Drive ke ~/.config/rclone/rclone.conf
   ```
2. Unduh arsip cadangan terbaru:
   ```bash
   rclone copy gdrive:CortexClip-Backup/ /tmp/backup-restore/ --include "cortexclip-backup-*.tar.gz"
   cd /tmp/backup-restore
   LATEST=$(ls -t cortexclip-backup-*.tar.gz | head -1)
   tar -xzf "$LATEST" -C /
   ```
3. Pulihkan database Supabase:
   ```bash
   cd ~/supabase-docker/docker
   sg docker -c "docker compose up -d"
   # Tunggu database siap, lalu import dump:
   gunzip -c /tmp/backup-restore/cortexclip-db-full.sql.gz | sg docker -c "docker compose exec -T db psql -U supabase_admin -d postgres"
   ```
4. Salin file storage (video & klip):
   ```bash
   cp -a /tmp/backup-restore/supabase-storage/* ~/supabase-docker/docker/volumes/storage/
   ```
5. Rebuild frontend & restart service:
   ```bash
   cd ~/cortexclip-backup
   NITRO_PRESET=node-server ~/.bun/bin/bun run build
   sudo systemctl restart cortexclip-backend cortexclip-frontend nginx
   ```

---

## 3. Arsitektur Port & Nginx Reverse Proxy (Port 80/443 Konsolidasi)

Semua layanan disatukan di balik port 80/443 untuk menghindari pemblokiran port non-standar oleh operator seluler (Telkomsel/Indosat):

- `/api/`, `/files/`, `/health` $\to$ Backend FastAPI (Port `8787`)
- `/auth/`, `/rest/`, `/storage/`, `/realtime/` $\to$ Supabase Gateway / Kong (Port `8000`)
- `/*` (Semua halaman web) $\to$ Frontend Nitro/Node (Port `8080`)

Konfigurasi Nginx tersimpan di `nginx/cortexclip.conf` dan diaktifkan di `/etc/nginx/sites-enabled/cortexclip`.

---

## 4. Konfigurasi Kunci & Token (.env)

Jika perlu membuat kredensial baru, jalankan:
```bash
python3 supabase/generate_keys.py
```
Script tersebut akan menghasilkan pasangan kunci HS256 yang valid untuk:
- `JWT_SECRET` (64 hex characters)
- `POSTGRES_PASSWORD`
- `ANON_KEY` (Role anonim)
- `SERVICE_ROLE_KEY` (Role superadmin backend)

Kunci ini wajib sama persis di 3 tempat:
1. `~/supabase-docker/docker/.env`
2. `~/cortexclip-backup/backend/.env`
3. `~/cortexclip-backup/.env` (Frontend)

---

## 5. Akun Superadmin Permanen
- **Email**: `admin@cortexclip.app`
- **Role**: `superadmin` / `owner`
- Kredensial login dicatat pada `~/AKUN-ADMIN.txt` (izin file 600).
- Akun ini memiliki proteksi abadi: tidak dapat di-ban, di-unadmin, atau dihapus oleh sub-admin mana pun.
