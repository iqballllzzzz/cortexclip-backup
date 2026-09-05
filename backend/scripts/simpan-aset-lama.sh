#!/bin/bash
# pre-deploy: asuransikan aset build lama supaya pengguna dengan HTML cache
# lama tidak kena 404 chunk (penyebab "This page didn't load").
set -e
OUT=/home/muhiqbalsukarno/cortexclip-backup/.output/public
LEGACY=/var/www/cortexclip-legacy
if [ -d "$OUT/assets" ]; then
  mkdir -p "$LEGACY"
  cp -n "$OUT"/assets/* "$LEGACY"/ 2>/dev/null || true
  echo "legacy: $(ls "$LEGACY" | wc -l) berkas"
fi
