#!/usr/bin/env bash
# ============================================================================
# CortexClip Auto Backup — rclone → Google Drive
# Aman: HANYA menyentuh folder "CortexClip-Backup" di Drive.
# - Membuat snapshot baru  : CortexClip-Backup/backup-<timestamp>/
# - Rotasi (hapus) HANYA   : folder backup-* LAMA di dalam CortexClip-Backup/
#   (max BACKUP_KEEP file/folder backup, yang tertua dihapus dulu)
# - TIDAK ADA operasi delete/update di luar folder tersebut.
# ============================================================================
set -euo pipefail

REMOTE="gdrive:CortexClip-Backup"
BACKUP_KEEP="${BACKUP_KEEP:-2}"          # simpan 2 snapshot terakhir saja
SOURCE_DIRS=(
  "/root/cortexclip/backend/.env"        # konfigurasi + API keys backend
  "/root/cortexclip/backend/run.py"
  "/root/cortexclip/backend/app"
  "/root/cortexclip-backup"              # frontend repo (kode + git)
  "/root/.hermes"                        # hermes profile (skills, memories, cron)
  "/root/.config/rclone/rclone.conf"     # config rclone (token drive)
)

LOG="/var/log/cortexclip-backup.log"
mkdir -p /var/log

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

# --- 1. buat staging dir ---
STAGE=$(mktemp -d /tmp/cortex-backup.XXXXXX)
trap 'rm -rf "$STAGE"' EXIT

log "=== Backup dimulai ==="

# --- 2. salin data ke staging ---
for src in "${SOURCE_DIRS[@]}"; do
  if [ -e "$src" ]; then
    # simpan dengan path relatif tanpa leading /
    rel="${src#/}"
    mkdir -p "$STAGE/$(dirname "$rel")"
    cp -a "$src" "$STAGE/$rel"
    log "  + $src"
  else
    log "  ! skip (tidak ada): $src"
  fi
done

# --- 3. buat archive tunggal (supaya 1 file, mudah rotate) ---
TS=$(date +%Y%m%d-%H%M%S)
ARCHIVE="$STAGE/cortexclip-backup-$TS.tar.gz"
# `|| true`: tar bisa exit non-zero kalau ada file berubah saat dibaca (live .hermes)
tar -czf "$ARCHIVE" -C "$STAGE" --exclude="$ARCHIVE" --warning=no-file-changed . 2>>"$LOG" || true
mv "$ARCHIVE" /tmp/cortexclip-backup-$TS.tar.gz
rm -rf "$STAGE"

# --- 4. upload ke Drive (di dalam CortexClip-Backup saja) ---
log "  upload: cortexclip-backup-$TS.tar.gz"
rclone copy /tmp/cortexclip-backup-$TS.tar.gz "$REMOTE" --drive-chunk-size 64M 2>>"$LOG"

# --- 5. rotasi: hapus backup-* LAMA di CortexClip-Backup (max BACKUP_KEEP) ---
#     AMAN: `rclone delete` hanya dijalankan dengan --min-age dan daftar file
#     backup-*.tar.gz — tidak mungkin kena file lain.
mapfile -t OLD < <(rclone lsf "$REMOTE" --files-only --include "cortexclip-backup-*.tar.gz" 2>>"$LOG")
COUNT=${#OLD[@]}
if [ "$COUNT" -gt "$BACKUP_KEEP" ]; then
  # hapus yang paling tua (urut lsf = alphabetical = timestamp tua dulu)
  TO_DELETE=$((COUNT - BACKUP_KEEP))
  for ((i=0; i<TO_DELETE; i++)); do
    log "  rotate hapus: ${OLD[$i]}"
    rclone delete "$REMOTE/${OLD[$i]}" 2>>"$LOG"
  done
fi

rm -f /tmp/cortexclip-backup-$TS.tar.gz
log "=== Backup selesai (tersimpan: $BACKUP_KEEP, total di Drive: $((COUNT < BACKUP_KEEP ? COUNT : BACKUP_KEEP))) ==="