#!/usr/bin/env bash
set -euo pipefail

# Determine script and project directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKUP_DIR="${PROJECT_DIR}/backups"

# Create backups directory if missing
mkdir -p "${BACKUP_DIR}"

# Read DATABASE_URL from the environment, falling back to .env.local
DB_URL="${DATABASE_URL:-}"
if [ -z "${DB_URL}" ] && [ -f "${PROJECT_DIR}/.env.local" ]; then
  # Read DATABASE_URL safely without exporting arbitrary lines
  DB_URL=$(grep -E '^DATABASE_URL=' "${PROJECT_DIR}/.env.local" | head -n 1 | cut -d '=' -f2- | tr -d '"' | tr -d "'")
fi

if [[ ! "${DB_URL}" =~ ^mysql:// ]]; then
  echo "ERROR: DATABASE_URL must be a mysql:// URL (got: '${DB_URL%%@*}...')." >&2
  exit 1
fi

# Split mysql://user:password@host:port/database into parts (handles URL-encoding).
# The password goes to mysqldump via MYSQL_PWD so it never appears in `ps` output.
DB_PARTS=$(node -e '
  const u = new URL(process.argv[1]);
  const out = [u.hostname, u.port || "3306", decodeURIComponent(u.username), decodeURIComponent(u.password), u.pathname.slice(1)];
  console.log(out.join("\n"));
' "${DB_URL}")
{ read -r DB_HOST; read -r DB_PORT; read -r DB_USER; read -r DB_PASS; read -r DB_NAME; } <<< "${DB_PARTS}"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/pos_backup_${TIMESTAMP}.sql.gz"

echo "==> Creating MySQL backup of '${DB_NAME}' to: ${BACKUP_FILE}"
# --single-transaction: consistent snapshot without locking tables (InnoDB)
# --routines --triggers --events: include everything, not just tables
MYSQL_PWD="${DB_PASS}" mysqldump \
  --host="${DB_HOST}" --port="${DB_PORT}" --user="${DB_USER}" \
  --single-transaction --routines --triggers --events \
  --default-character-set=utf8mb4 \
  "${DB_NAME}" | gzip > "${BACKUP_FILE}"

echo "==> Backup successfully created ($(du -h "${BACKUP_FILE}" | cut -f1))."

# Retain only the most recent 30 backup files
echo "==> Pruning backups older than the most recent 30..."
cd "${BACKUP_DIR}"
# List all backups sorted by newest first, skip first 30, remove the rest
ls -t pos_backup_*.sql.gz 2>/dev/null | tail -n +31 | while read -r old_dump; do
  if [ -n "${old_dump}" ]; then
    echo "    Removing old backup: ${old_dump}"
    rm -f "${old_dump}"
  fi
done

echo "==> Backup process completed. Current backups count: $(ls -1 pos_backup_*.sql.gz 2>/dev/null | wc -l | tr -d ' ')"
