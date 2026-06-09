#!/usr/bin/env bash
# Generate EAP047 self-study seed JSON via AI inside the Docker container.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
set -a && source .env && set +a

DAYS="${EAP_SEED_DAYS:-30}"
READING="${EAP_SEED_READING:-10}"
OUT_CONTAINER="/data/seeds/eap047_draft.json"
OUT_HOST="$ROOT/data/seeds/eap047_draft.json"

mkdir -p "$ROOT/data/seeds"

echo "Rebuilding container so /app has latest scripts (git pull alone is not enough)…"
sudo docker compose up -d --build

if ! sudo docker compose exec -T eap grep -q "three API calls (10+10+10)" /app/backend/scripts/generate_eap047_self_study_seeds.py 2>/dev/null; then
  echo "error: container still has old generate script — run: sudo docker compose up -d --build" >&2
  exit 1
fi

sudo docker compose exec -T eap mkdir -p /data/seeds

echo "Generating vocab ${DAYS} days + ${READING} reading passages (AI)…"
echo "(30 words/day = 3×10 word batches; checkpoints after each day — may take 30–90 min)"
RESUME=""
if [[ -f "$OUT_HOST" ]]; then
  RESUME="--resume"
  echo "Found existing draft — resuming with --resume"
fi
sudo docker compose exec -T eap python /app/backend/scripts/generate_eap047_self_study_seeds.py \
  $RESUME --days "$DAYS" --reading "$READING" --out "$OUT_CONTAINER"

sudo docker compose cp "eap:$OUT_CONTAINER" "$OUT_HOST"
echo "Saved: $OUT_HOST"
echo "Review the JSON, then: ./ops/lighthouse-import-seeds.sh"
