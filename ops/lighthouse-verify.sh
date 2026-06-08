#!/usr/bin/env bash
# Post-deploy smoke test for Tencent Lighthouse (or any Docker host).
# Usage (on server, after git pull):
#   cd ~/eap_platform_agent
#   chmod +x ops/lighthouse-verify.sh
#   ./ops/lighthouse-verify.sh
#
# Override base URL or password:
#   EAP_VERIFY_BASE=http://124.222.124.42:5051 EAP_PILOT_DEFAULT_PASSWORD='secret' ./ops/lighthouse-verify.sh
#
# Note: uses backend/scripts/verify_pilot.py from the git checkout (not the baked-in
# container copy). Rebuild the app image after code changes:
#   sudo docker compose up -d --build

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
SCRIPT="$ROOT/backend/scripts/verify_pilot.py"

echo "EAP verify — base=$BASE class=$CLASS"
echo "(uses EAP_PILOT_DEFAULT_PASSWORD from .env when set)"
echo

# After `docker compose up`, gunicorn may need a few seconds (entrypoint seeds DB first).
wait_ready() {
  local probe="${1:-http://127.0.0.1:5051}"
  local i
  for i in $(seq 1 30); do
    if curl -sf --max-time 3 "${probe}/api/health" >/dev/null 2>&1; then
      echo "Service ready (${probe}/api/health)."
      echo
      return 0
    fi
    if [[ "$i" -eq 1 ]]; then
      echo "Waiting for EAP to start (up to ~60s)…"
    fi
    sleep 2
  done
  echo "warning: ${probe}/api/health not ready — continuing verify anyway" >&2
  echo
}

if command -v curl >/dev/null 2>&1; then
  wait_ready "http://127.0.0.1:5051"
fi

run_verify() {
  python3 "$SCRIPT" \
    --base "$BASE" \
    --password "$PASSWORD" \
    --class-name "$CLASS"
}

if [[ -f "$SCRIPT" ]] && command -v python3 >/dev/null 2>&1; then
  run_verify
elif sudo docker compose ps --status running 2>/dev/null | grep -q eap; then
  echo "Note: falling back to container script (may be older than git pull). Prefer: apt install python3"
  echo
  sudo docker compose exec -T eap python /app/backend/scripts/verify_pilot.py \
    --base "$BASE" \
    --password "$PASSWORD" \
    --class-name "$CLASS"
else
  echo "error: need python3 + $SCRIPT or a running eap container" >&2
  exit 1
fi
