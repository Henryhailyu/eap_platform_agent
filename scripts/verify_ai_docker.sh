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
echo "=== /api/health (wait up to 90s for gunicorn after seeds) ==="
health_ok=0
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:5051/api/health >/tmp/eap_health.json 2>/dev/null; then
    health_ok=1
    break
  fi
  echo "  waiting for backend... attempt $i/30"
  sleep 3
done
if [ "$health_ok" = "1" ]; then
  python3 -c "import json; d=json.load(open('/tmp/eap_health.json')); print(json.dumps(d.get('ai',{}), indent=2))" 2>/dev/null \
    || cat /tmp/eap_health.json | head -c 600
else
  echo "ERROR: /api/health not reachable. Check: sudo docker compose logs eap --tail 80"
fi

echo ""
echo "=== optional: live Hunyuan ping (may take 10-20s) ==="
sudo docker compose exec -T eap python -c "
from eap_ai import ai_ping, ai_is_configured
if not ai_is_configured():
    print('SKIP: AI not configured')
else:
    try:
        print(ai_ping())
    except Exception as e:
        print('PING_FAILED:', str(e)[:300])
" 2>/dev/null || echo "(ping skipped — container busy or python error)"

echo ""
echo "Done. Expect: openai_key_set, configured true, active_configured true, health JSON ok."
