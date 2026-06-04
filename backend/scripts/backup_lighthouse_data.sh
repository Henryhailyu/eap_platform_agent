#!/usr/bin/env bash
# Backup EAP SQLite + uploads from the Lighthouse Docker volume (/data).
# Run on the server: cd ~/eap_platform_agent && ./backend/scripts/backup_lighthouse_data.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found" >&2
  exit 1
fi

COMPOSE="docker compose"
if ! $COMPOSE ps >/dev/null 2>&1; then
  COMPOSE="sudo docker compose"
fi

STAMP="$(date -u +%Y-%m-%d_%H%M%S)"
DEST="${HOME}/eap_backups/eap_backup_${STAMP}"
mkdir -p "$DEST"

echo "Backing up to ${DEST} ..."

$COMPOSE exec -T eap test -f /data/eap_platform.db
$COMPOSE cp eap:/data/eap_platform.db "${DEST}/eap_platform.db"

$COMPOSE exec -T eap sh -c '
  if [ -d /data/uploads ]; then
    tar czf /tmp/eap_uploads.tgz -C /data uploads
  else
    tar czf /tmp/eap_uploads.tgz --files-from /dev/null 2>/dev/null || true
  fi
'
$COMPOSE cp eap:/tmp/eap_uploads.tgz "${DEST}/uploads.tgz" 2>/dev/null || true

cat > "${DEST}/manifest.txt" <<EOF
created_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)
host=$(hostname)
compose_root=${ROOT}
db=eap_platform.db
uploads=uploads.tgz (if present)
EOF

ls -la "${DEST}"
echo "Done. Copy ${DEST} off the server for safekeeping."
