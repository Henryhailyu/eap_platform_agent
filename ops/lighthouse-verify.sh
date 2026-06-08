#!/usr/bin/env bash
# Post-deploy smoke test for Tencent Lighthouse (or any Docker host).
# Usage (on server, after git pull):
#   cd ~/eap_platform_agent
#   chmod +x ops/lighthouse-verify.sh
#   ./ops/lighthouse-verify.sh
#
# Override base URL or password:
#   EAP_VERIFY_BASE=http://124.222.124.42:5051 EAP_PILOT_DEFAULT_PASSWORD='secret' ./ops/lighthouse-verify.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

BASE="${EAP_VERIFY_BASE:-http://127.0.0.1:5051}"
PASSWORD="${EAP_PILOT_DEFAULT_PASSWORD:-123456}"
CLASS="${EAP_VERIFY_CLASS:-EAP047}"

echo "EAP verify — base=$BASE class=$CLASS"
echo "(uses EAP_PILOT_DEFAULT_PASSWORD from .env when set)"
echo

if sudo docker compose ps --status running 2>/dev/null | grep -q eap; then
  sudo docker compose exec -T eap python /app/backend/scripts/verify_pilot.py \
    --base "$BASE" \
    --password "$PASSWORD" \
    --class-name "$CLASS"
else
  python3 backend/scripts/verify_pilot.py \
    --base "$BASE" \
    --password "$PASSWORD" \
    --class-name "$CLASS"
fi
