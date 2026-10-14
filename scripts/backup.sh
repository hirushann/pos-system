#!/usr/bin/env bash
set -euo pipefail

# Determine script and project directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKUP_DIR="${PROJECT_DIR}/backups"

# Create backups directory if missing
mkdir -p "${BACKUP_DIR}"

# Load environment variables from .env.local if present
if [ -f "${PROJECT_DIR}/.env.local" ]; then
  # Read DATABASE_URL safely without exporting arbitrary lines
  DB_URL=$(grep -E '^DATABASE_URL=' "${PROJECT_DIR}/.env.local" | head -n 1 | cut -d '=' -f2- | tr -d '"' | tr -d "'")
fi

TARGET_DB="${DB_URL:-pos_dev}"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/pos_backup_${TIMESTAMP}.dump"

echo "==> Creating PostgreSQL backup to: ${BACKUP_FILE}"
if [[ "${TARGET_DB}" =~ ^postgres(ql)?:// ]]; then
  pg_dump -Fc "${TARGET_DB}" -f "${BACKUP_FILE}"
else
  pg_dump -Fc -d "${TARGET_DB}" -f "${BACKUP_FILE}"
fi

echo "==> Backup successfully created ($(du -h "${BACKUP_FILE}" | cut -f1))."

# Retain only the most recent 30 backup files
echo "==> Pruning backups older than the most recent 30..."
cd "${BACKUP_DIR}"
# List all *.dump files sorted by newest first, skip first 30, remove the rest
ls -t pos_backup_*.dump 2>/dev/null | tail -n +31 | while read -r old_dump; do
  if [ -n "${old_dump}" ]; then
    echo "    Removing old backup: ${old_dump}"
    rm -f "${old_dump}"
  fi
done

echo "==> Backup process completed. Current backups count: $(ls -1 pos_backup_*.dump 2>/dev/null | wc -l | tr -d ' ')"
