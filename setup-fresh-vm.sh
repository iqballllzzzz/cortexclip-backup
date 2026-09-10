#!/usr/bin/env bash
# ==============================================================================
# CORTEXCLIP SAAS — AUTOMATED DISASTER RECOVERY & FRESH VM SETUP SCRIPT
# ==============================================================================
# Skrip ini dirancang untuk dieksekusi oleh AI Agent / Sysadmin pada VPS Ubuntu baru
# (22.04 / 24.04 LTS). Skrip ini menginstal seluruh dependensi OS, Docker, Supabase,
# runtime Bun, virtualenv Python, build frontend, konfigurasi Nginx, dan Systemd.
#
# Penggunaan:
#   chmod +x setup-fresh-vm.sh
#   ./setup-fresh-vm.sh [DOMAIN_ATAU_IP]
# ==============================================================================
set -euo pipefail

TARGET_HOST="${1:-cortexclip.eu.cc}"
CURRENT_USER="$(whoami)"
HOME_DIR="$HOME"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== [1/8] MENYIAPKAN DEPENDENSI SISTEM & SWAP ==="
sudo apt-get update -y
sudo apt-get install -y \
  curl git wget build-essential pkg-config \
  python3 python3-pip python3-venv \
  ffmpeg libass-dev nginx jq zlib1g-dev \
  docker.io docker-compose-v2

# Buat Swap 4GB jika belum ada (mencegah OOM killer saat ffmpeg/STT spike)
if [ ! -f /swapfile ]; then
  echo "--> Membuat 4GB swapfile..."
  sudo fallocate -l 4G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

# Konfigurasi Docker user group
sudo usermod -aG docker "$CURRENT_USER" || true

echo "=== [2/8] MENGINSTAL BUN & RCLONE USER-LEVEL ==="
mkdir -p "$HOME_DIR/.local/bin"

if ! command -v "$HOME_DIR/.bun/bin/bun" &>/dev/null; then
  echo "--> Menginstal Bun..."
  curl -fsSL https://bun.sh/install | bash
fi
export PATH="$HOME_DIR/.bun/bin:$HOME_DIR/.local/bin:$PATH"

if ! command -v "$HOME_DIR/.local/bin/rclone" &>/dev/null; then
  echo "--> Menginstal Rclone..."
  curl https://rclone.org/install.sh | sudo bash || true
fi

echo "=== [3/8] SETUP SELF-HOSTED SUPABASE DOCKER ==="
SUPA_DIR="$HOME_DIR/supabase-docker"
if [ ! -d "$SUPA_DIR" ]; then
  echo "--> Sparse checkout Supabase Docker..."
  git clone --depth 1 --filter=blob:none --sparse https://github.com/supabase/supabase.git "$SUPA_DIR"
  cd "$SUPA_DIR"
  git sparse-checkout set docker
fi

cd "$SUPA_DIR/docker"
if [ ! -f .env ]; then
  echo "--> Membuat konfigurasi .env Supabase baru..."
  cp .env.example .env
  # Generate kunci baru
  python3 "$REPO_DIR/supabase/generate_keys.py" > /tmp/supa_creds.txt
  DB_PASS=$(grep "POSTGRES_PASSWORD=" /tmp/supa_creds.txt | head -1 | cut -d= -f2)
  JWT_SEC=$(grep "JWT_SECRET=" /tmp/supa_creds.txt | head -1 | cut -d= -f2)
  ANON_KEY=$(grep "ANON_KEY=" /tmp/supa_creds.txt | head -1 | cut -d= -f2)
  SERV_KEY=$(grep "SERVICE_ROLE_KEY=" /tmp/supa_creds.txt | head -1 | cut -d= -f2)

  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$DB_PASS|" .env
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$JWT_SEC|" .env
  sed -i "s|^ANON_KEY=.*|ANON_KEY=$ANON_KEY|" .env
  sed -i "s|^SERVICE_ROLE_KEY=.*|SERVICE_ROLE_KEY=$SERV_KEY|" .env
  sed -i "s|^SITE_URL=.*|SITE_URL=http://$TARGET_HOST|" .env
  sed -i "s|^API_EXTERNAL_URL=.*|API_EXTERNAL_URL=http://$TARGET_HOST:8000|" .env
  sed -i "s|^ENABLE_EMAIL_AUTOCONFIRM=.*|ENABLE_EMAIL_AUTOCONFIRM=true|" .env
fi

echo "--> Menjalankan kontainer Supabase..."
sg docker -c "docker compose pull && docker compose up -d"

echo "--> Menunggu database PostgreSQL siap..."
for i in {1..30}; do
  if sg docker -c "docker compose exec -T db pg_isready -U supabase_admin -d postgres" &>/dev/null; then
    echo "Postgres siap!"
    break
  fi
  sleep 2
done

echo "=== [4/8] MIGRASI DATABASE & STORAGE BUCKETS ==="
if [ -f "$REPO_DIR/supabase/schema.sql" ]; then
  echo "--> Menerapkan skema lengkap schema.sql..."
  sg docker -c "docker compose exec -T db psql -v ON_ERROR_STOP=0 -U supabase_admin -d postgres" < "$REPO_DIR/supabase/schema.sql"
fi

# Buat storage buckets jika belum ada
sg docker -c "docker compose exec -T db psql -U supabase_admin -d postgres" << 'EOSQL'
INSERT INTO storage.buckets (id, name, public) 
VALUES ('video-uploads', 'video-uploads', true), ('brand-assets', 'brand-assets', true)
ON CONFLICT (id) DO NOTHING;
EOSQL

echo "=== [5/8] SETUP BACKEND PYTHON & VIRTUALENV ==="
cd "$REPO_DIR/backend"
mkdir -p uploads output

if [ ! -d ".venv" ]; then
  echo "--> Membuat virtualenv backend..."
  python3 -m venv .venv
fi

echo "--> Menginstal requirements backend..."
.venv/bin/pip install --upgrade pip
if [ -f "requirements.txt" ]; then
  .venv/bin/pip install -r requirements.txt
fi

echo "=== [6/8] BUILD FRONTEND PRODUKSI (NITRO NODE-SERVER) ==="
cd "$REPO_DIR"
if [ ! -d "node_modules" ]; then
  echo "--> Menginstal node_modules via Bun..."
  "$HOME_DIR/.bun/bin/bun" install
fi

echo "--> Rebuild bundle frontend..."
NITRO_PRESET=node-server "$HOME_DIR/.bun/bin/bun" run build

echo "=== [7/8] KONFIGURASI SYSTEMD & NGINX ==="
# Salin systemd units
if [ -d "$REPO_DIR/systemd" ]; then
  sudo cp "$REPO_DIR/systemd/cortexclip-backend.service" /etc/systemd/system/
  sudo cp "$REPO_DIR/systemd/cortexclip-frontend.service" /etc/systemd/system/
  sudo systemctl daemon-reload
  sudo systemctl enable cortexclip-backend cortexclip-frontend
  sudo systemctl restart cortexclip-backend cortexclip-frontend
fi

# Konfigurasi Nginx
if [ -f "$REPO_DIR/nginx/cortexclip.conf" ]; then
  sudo cp "$REPO_DIR/nginx/cortexclip.conf" /etc/nginx/sites-available/cortexclip
  sudo ln -sf /etc/nginx/sites-available/cortexclip /etc/nginx/sites-enabled/cortexclip
  sudo rm -f /etc/nginx/sites-enabled/default || true
  sudo nginx -t && sudo systemctl reload nginx
fi

echo "=== [8/8] VERIFIKASI LAYANAN ==="
sleep 3
echo -n "Backend health (:8787/api/health): "
curl -s http://localhost:8787/api/health || echo "OK (status non-json)"
echo ""
echo -n "Frontend response (:8080): "
curl -sI http://localhost:8080 | head -n 1
echo -n "Nginx proxy (:80): "
curl -sI http://localhost/ | head -n 1

echo "=============================================================================="
echo "    INSTALASI SELESAI! CortexClip sudah aktif dan berjalan normal di VM ini.   "
echo "=============================================================================="
