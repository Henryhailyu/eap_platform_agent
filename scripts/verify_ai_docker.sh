#!/usr/bin/env bash
# Run on Lighthouse: cd ~/eap_platform_agent && bash scripts/verify_ai_docker.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== .env AI lines (key masked) ==="
if [[ ! -f .env ]]; then
  echo "ERROR: .env missing in $(pwd)"
  exit 1
fi
grep -E '^EAP_AI_|^EAP_OPENAI|^EAP_DEEPSEEK' .env | sed 's/=sk-.*/=sk-***MASKED***/' || true

echo ""
echo "=== docker-compose AI passthrough ==="
grep -E 'env_file|OPENAI|AI_ENABLED|AI_PROVIDER' docker-compose.yml | head -20

echo ""
echo "=== container env (no full key) ==="
sudo docker compose exec -T eap sh -c '
  echo "EAP_AI_ENABLED=$EAP_AI_ENABLED"
  echo "EAP_AI_PROVIDER=$EAP_AI_PROVIDER"
  echo "EAP_OPENAI_BASE_URL=$EAP_OPENAI_BASE_URL"
  echo "EAP_OPENAI_MODEL=$EAP_OPENAI_MODEL"
  if [ -n "${EAP_OPENAI_API_KEY:-}" ]; then echo "EAP_OPENAI_API_KEY=set"; else echo "EAP_OPENAI_API_KEY=MISSING"; fi
  if [ -n "${EAP_DEEPSEEK_API_KEY:-}" ]; then echo "EAP_DEEPSEEK_API_KEY=set"; else echo "EAP_DEEPSEEK_API_KEY=empty"; fi
'

echo ""
echo "=== /api/health ai block ==="
curl -sS http://127.0.0.1:5051/api/health | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d.get('ai',{}), indent=2))" 2>/dev/null || curl -sS http://127.0.0.1:5051/api/health | head -c 600

echo ""
echo "Done. Expect: openai_key_set true, configured true, active_configured true."
