#!/usr/bin/env bash
# Import reviewed seed JSON into production SQLite (/data) inside Docker.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
IN_HOST="${1:-$ROOT/data/seeds/eap047_draft.json}"
IN_CONTAINER="/data/seeds/eap047_draft.json"

if [[ ! -f "$IN_HOST" ]]; then
  echo "error: missing $IN_HOST" >&2
  exit 1
fi

sudo docker compose exec -T eap mkdir -p /data/seeds
sudo docker compose cp "$IN_HOST" "eap:$IN_CONTAINER"
sudo docker compose exec -T eap python /app/backend/scripts/import_eap047_self_study_seeds.py \
  --in "$IN_CONTAINER" --apply
echo "Import complete."
