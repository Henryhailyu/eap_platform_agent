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

if ! sudo docker compose exec -T eap grep -q "MAX_VOCAB_BATCHES" /app/backend/scripts/generate_eap047_self_study_seeds.py 2>/dev/null; then
  echo "error: container still has old generate script — run: sudo docker compose up -d --build" >&2
  exit 1
fi

sudo docker compose exec -T eap mkdir -p /data/seeds

echo "Generating vocab ${DAYS} days + ${READING} reading passages (AI)…"
echo "(30 words/day with top-up batches; checkpoints after each day — may take 45–120 min)"
RESUME=""
REGEN_VOCAB=""
FILL_GAPS=""
if [[ -f "$OUT_HOST" ]]; then
  RESUME="--resume"
  if [[ "${EAP_FILL_VOCAB_GAPS:-0}" == "1" ]]; then
    FILL_GAPS="--fill-vocab-gaps"
    echo "Found existing draft — filling vocabulary gaps only (fast; keeps reading)"
  elif [[ "${EAP_REGEN_VOCAB:-0}" == "1" ]]; then
    REGEN_VOCAB="--regen-vocab"
    echo "Found existing draft — regenerating vocabulary only (keeping reading passages)"
  else
    echo "Found existing draft — resuming with --resume"
    echo "  EAP_FILL_VOCAB_GAPS=1  → top up short days only"
    echo "  EAP_REGEN_VOCAB=1      → redo all vocab days"
  fi
fi
sudo docker compose exec -T eap python /app/backend/scripts/generate_eap047_self_study_seeds.py \
  $RESUME $REGEN_VOCAB $FILL_GAPS --days "$DAYS" --reading "$READING" --out "$OUT_CONTAINER"

sudo docker compose cp "eap:$OUT_CONTAINER" "$OUT_HOST"
echo "Saved: $OUT_HOST"
echo "Review the JSON, then: ./ops/lighthouse-import-seeds.sh"
