#!/usr/bin/env bash
# Sambungkan CortexClip ke domain baru: nginx + SSL + env + Supabase + build.
#
# Pakai:
#   sudo bash scripts/add-domain.sh DOMAINBARU.com [--dry-run] [--email you@mail.com]
#
# Domain LAMA tetap hidup (ditambah, bukan diganti), jadi aman untuk transisi.
# WAJIB: DNS A record domain -> IP VPS sudah propagasi sebelum dijalankan.
set -euo pipefail

DOMAIN="${1:-}"
DRY=0
EMAIL="admin@${DOMAIN:-example.com}"
shift || true
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --email) shift; EMAIL="$1" ;;
    *) echo "argumen tidak dikenal: $1" >&2; exit 2 ;;
  esac
  shift
done

if [ -z "$DOMAIN" ]; then
  echo "Pakai: sudo bash scripts/add-domain.sh DOMAINBARU.com [--dry-run] [--email you@mail.com]" >&2
  exit 2
fi
if [ "$DRY" -eq 0 ] && [ "$(id -u)" -ne 0 ]; then
  echo "Harus root (pakai sudo)." >&2
  exit 2
fi

REPO="/home/muhiqbalsukarno/cortexclip-backup"
SUPA="/home/muhiqbalsukarno/supabase-docker/docker"
NGINX_CONF="/etc/nginx/sites-available/cortexclip"
OLD_DOMAIN="clip.aqualibrya.my.id"
NEW_URL="https://${DOMAIN}"

run() {
  if [ "$DRY" -eq 1 ]; then
    echo "  [dry-run] $*"
  else
    eval "$@"
  fi
}

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

step "1/7 Cek DNS ${DOMAIN}"
VPS_IP="$(curl -s --max-time 15 https://api.ipify.org || echo '')"
echo "  IP VPS      : ${VPS_IP:-tidak terdeteksi}"
for host in "$DOMAIN" "www.$DOMAIN"; do
  got="$(dig +short "$host" @1.1.1.1 2>/dev/null | tail -1)"
  echo "  ${host} -> ${got:-(kosong)}"
  if [ "$host" = "$DOMAIN" ] && [ -n "$VPS_IP" ] && [ "$got" != "$VPS_IP" ]; then
    echo "  !! DNS belum mengarah ke VPS. Perbaiki dulu di gname.com," >&2
    echo "     tunggu propagasi, lalu jalankan lagi. certbot akan gagal." >&2
    [ "$DRY" -eq 1 ] || exit 1
  fi
done

step "2/7 Tambah domain ke nginx server_name"
if grep -q "$DOMAIN" "$NGINX_CONF" 2>/dev/null; then
  echo "  sudah ada di $NGINX_CONF — dilewati"
else
  run "cp '$NGINX_CONF' '${NGINX_CONF}.bak.$(date +%s)'"
  # sisipkan setelah domain lama pada setiap baris server_name
  run "sed -i 's/server_name ${OLD_DOMAIN}/server_name ${OLD_DOMAIN} ${DOMAIN} www.${DOMAIN}/g' '$NGINX_CONF'"
  run "nginx -t"
  run "systemctl reload nginx"
  echo "  server_name diperbarui"
fi

step "3/7 Sertifikat SSL (Let's Encrypt)"
if [ -d "/etc/letsencrypt/live/${DOMAIN}" ]; then
  echo "  sertifikat ${DOMAIN} sudah ada — dilewati"
else
  run "certbot --nginx -d '${DOMAIN}' -d 'www.${DOMAIN}' \
       --non-interactive --agree-tos -m '${EMAIL}' --redirect"
fi
run "systemctl enable --now certbot.timer"

step "4/7 Update env backend + frontend"
set_env() {  # file key value
  local f="$1" k="$2" v="$3"
  if grep -qE "^${k}=" "$f" 2>/dev/null; then
    run "sed -i 's|^${k}=.*|${k}=${v}|' '$f'"
  else
    run "printf '%s=%s\n' '${k}' '${v}' >> '$f'"
  fi
  echo "  ${f##*/}: ${k}=${v}"
}
for kv in PUBLIC_SUPABASE_URL PUBLIC_BASE_URL; do
  set_env "$REPO/backend/.env" "$kv" "$NEW_URL"
done
for kv in SUPABASE_URL VITE_SUPABASE_URL VITE_BACKEND_URL; do
  set_env "$REPO/.env" "$kv" "$NEW_URL"
done

step "5/7 Update Supabase auth URL"
if [ -f "$SUPA/.env" ]; then
  set_env "$SUPA/.env" SITE_URL "$NEW_URL"
  set_env "$SUPA/.env" API_EXTERNAL_URL "${NEW_URL}/auth/v1"
  set_env "$SUPA/.env" SUPABASE_PUBLIC_URL "$NEW_URL"
  # domain lama tetap diizinkan supaya link email lama tidak mati
  set_env "$SUPA/.env" ADDITIONAL_REDIRECT_URLS "https://${OLD_DOMAIN},${NEW_URL}"
  run "cd '$SUPA' && sg docker -c 'docker compose up -d'"
else
  echo "  $SUPA/.env tidak ditemukan — dilewati"
fi

step "6/7 Build frontend & restart service"
# VITE_* dibaca saat BUILD, jadi wajib build ulang setelah env berubah
run "cd '$REPO' && sudo -u muhiqbalsukarno env NITRO_PRESET=node-server npm run build"
run "systemctl restart cortexclip-backend cortexclip-frontend"
run "sleep 8"

step "7/7 Verifikasi"
for p in "/" "/docs" "/api/premium/plans"; do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 "${NEW_URL}${p}" 2>/dev/null || true)"
  echo "  ${NEW_URL}${p} -> ${code:-000}"
done
old_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 "https://${OLD_DOMAIN}/" 2>/dev/null || true)"
echo "  ${OLD_DOMAIN} masih aktif: ${old_code:-000}"

cat <<EOF

Selesai. Langkah manual yang tersisa:
  1. Google Search Console: tambahkan ${DOMAIN}, verifikasi lewat DNS TXT
     di gname.com, submit ${NEW_URL}/sitemap.xml
  2. Update SITE_URL di src/lib/seo-jsonld.ts serta public/sitemap.xml dan
     public/robots.txt ke ${DOMAIN}, lalu build ulang (JSON-LD, canonical,
     dan sitemap harus konsisten dengan domain utama)
  3. Kalau domain lama mau ditinggalkan, ubah blok ${OLD_DOMAIN} jadi
     redirect 301 ke ${NEW_URL} (lihat docs/SAMBUNG-DOMAIN-BARU.md)
EOF
