# CORTEXCLIP DISASTER RECOVERY & SETUP MANUAL

Panduan pemulihan sistem jika VM mati atau beralih ke server baru.

## 🚀 Cara Cepat (Otomatis)
Pada VM Ubuntu 22.04 / 24.04 baru:
```bash
git clone https://github.com/iqballllzzzz/cortexclip-backup.git cortexclip-backup
cd cortexclip-backup
chmod +x setup-fresh-vm.sh
./setup-fresh-vm.sh cortexclip.eu.cc
```

## 📦 Komponen Cadangan
Cadangan otomatis dikirim ke Google Drive (`gdrive:CortexClip-Backup`) setiap 6 jam:
1. **Database PostgreSQL**: dump lengkap skema + akun user (`auth.users`, `profiles`, `projects`, `clips`).
2. **Storage Files**: file video dan klip hasil render (`supabase/volumes/storage/`).
3. **Kode Sumber & Konfigurasi**: seluruh repo, `.env`, rclone config, nginx config, systemd units.

Panduan detil dan struktur konfigurasi tersedia di `supabase/SETUP_FRESH_VM.md`.
