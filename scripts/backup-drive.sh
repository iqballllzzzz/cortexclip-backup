#!/usr/bin/env bash
# ============================================================================
# CortexClip Auto Backup v2 — rclone → Google Drive (tiap 6 jam via cron)
# Backup LENGKAP:
#   - Repo (kode + .env backend & frontend)
#   - DUMP DATABASE Supabase (auth.users, profiles, projects, clips,
#     render_jobs — semua akun & data user)
#   - STORAGE files (video uploads + klip rendered di volumes/storage)
#   - Hermes profile + rclone config
# Rotasi: max BACKUP_KEEP snapshot terakhir (hanya file backup-*.tar.gz).
# Aman: HANYA menyentuh folder "CortexClip-Backup" di Drive.
# ============================================================================
set -euo pipefail

HOME_DIR="/home/muhiqbalsukarno"
RCLONE="$HOME_DIR/.local/bin/rclone"
SUPA_DIR="$HOME_DIR/supabase-docker/docker"
REMOTE="gdrive:CortexClip-Backup"
BACKUP_KEEP="${BACKUP_KEEP:-4}"

SOURCE_DIRS=(
  "$HOME_DIR/cortexclip-backup"                      # repo: frontend + backend + .env
  "$HOME_DIR/.hermes"                                # hermes profile (skills, memories, cron)
  "$HOME_DIR/.config/rclone/rclone.conf"             # config rclone (token drive)
)

LOG="$HOME_DIR/cortexclip-backup/backup.log"
mkdir -p "$(dirname "$LOG")"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

STAGE=$(mktemp -d /tmp/cortex-backup.XXXXXX)
trap 'rm -rf "$STAGE"' EXIT

log "=== Backup dimulai ==="

# --- 0. DUMP DATABASE (paling penting: akun user + projects + clips) ---
DUMP_CMD="docker compose exec -T db pg_dump -U supabase_admin -d postgres --clean --if-exists"
if (cd "$SUPA_DIR" && sg docker -c "$DUMP_CMD" > "$STAGE/cortexclip-db-full.sql" 2>"$STAGE/dbdump.err" && [ -s "$STAGE/cortexclip-db-full.sql" ]); then
  gzip -f "$STAGE/cortexclip-db-full.sql"
  DBSIZE=$(stat -c%s "$STAGE/cortexclip-db-full.sql.gz")
  log "  + dump database OK (${DBSIZE} bytes)"
else
  log "  !! GAGAL dump database — cek $STAGE/dbdump.err"
  cat "$STAGE/dbdump.err" >> "$LOG" 2>/dev/null || true
  exit 1   # WAJIB: tanpa dump database backup tidak berarti
fi

# --- 0b. STORAGE files (video uploads + rendered clips) ---
if [ -d "$SUPA_DIR/volumes/storage" ]; then
  mkdir -p "$STAGE/supabase-storage"
  if cp -a "$SUPA_DIR/volumes/storage/." "$STAGE/supabase-storage/" 2>>"$LOG"; then
    log "  + storage files OK ($(du -sh "$STAGE/supabase-storage" | cut -f1))"
  else
    log "  ! sebagian storage files gagal ke-copy (permission) — backup lanjut"
  fi
else
  log "  ! storage dir tidak ada, skip"
fi

# --- 1. salin source dirs ke staging ---
for src in "${SOURCE_DIRS[@]}"; do
  if [ -e "$src" ]; then
    rel="${src#/}"
    mkdir -p "$STAGE/$(dirname "$rel")"
    cp -a "$src" "$STAGE/$rel"
    log "  + $src"
  else
    log "  ! skip (tidak ada): $src"
  fi
done

# --- 2. archive tunggal ---
TS=$(date +%Y%m%d-%H%M%S)
ARCHIVE="$STAGE/cortexclip-backup-$TS.tar.gz"
tar -czf "$ARCHIVE" -C "$STAGE" \
  --exclude="$ARCHIVE" \
  --exclude="node_modules" \
  --exclude=".output" \
  --exclude=".venv" \
  --exclude="__pycache__" \
  --warning=no-file-changed . 2>>"$LOG" || true
mv "$ARCHIVE" /tmp/cortexclip-backup-$TS.tar.gz
rm -rf "$STAGE"
log "  archive: $(stat -c%s /tmp/cortexclip-backup-$TS.tar.gz) bytes"

# --- 3. upload ke Drive ---
log "  upload: cortexclip-backup-$TS.tar.gz"
"$RCLONE" copy /tmp/cortexclip-backup-$TS.tar.gz "$REMOTE" --drive-chunk-size 64M 2>>"$LOG"
rm -f /tmp/cortexclip-backup-$TS.tar.gz

# --- 4. rotasi ---
mapfile -t OLD < <("$RCLONE" lsf "$REMOTE" --files-only --include "cortexclip-backup-*.tar.gz" 2>>"$LOG")
COUNT=${#OLD[@]}
if [ "$COUNT" -gt "$BACKUP_KEEP" ]; then
  TO_DELETE=$((COUNT - BACKUP_KEEP))
  for ((i=0; i<TO_DELETE; i++)); do
    log "  rotate hapus: ${OLD[$i]}"
    "$RCLONE" delete "$REMOTE/${OLD[$i]}" 2>>"$LOG"
  done
fi

log "=== Backup selesai (tersimpan: $BACKUP_KEEP, total di Drive: $((COUNT < BACKUP_KEEP ? COUNT : BACKUP_KEEP))) ==="
