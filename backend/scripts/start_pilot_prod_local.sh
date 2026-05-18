#!/usr/bin/env sh
# I0: run production-style Gunicorn locally (smoke-test before HTTPS deploy).
set -e
cd "$(dirname "$0")/.."
if [ ! -d venv ]; then
  python3 -m venv venv
  ./venv/bin/pip install -q -r requirements.txt -r ../requirements-prod.txt
fi
if ! ./venv/bin/python -c "import gunicorn" 2>/dev/null; then
  ./venv/bin/pip install -q -r ../requirements-prod.txt
fi
export EAP_ENV=production
export EAP_PILOT_MODE=1
export EAP_PRODUCTION_PRESET=1
export EAP_REQUIRE_SESSION_IDENTITY=1
export EAP_ENFORCE_MEMBERSHIP=1
export PORT="${PORT:-5051}"
export EAP_PUBLIC_URL="${EAP_PUBLIC_URL:-http://127.0.0.1:${PORT}}"
if [ -z "${EAP_SECRET_KEY:-}" ]; then
  export EAP_SECRET_KEY="$(openssl rand -hex 32)"
  echo "Generated EAP_SECRET_KEY for this session (export it for real deploy)."
fi
echo "Production pilot local: ${EAP_PUBLIC_URL}"
echo "Verify: python scripts/verify_pilot.py --base ${EAP_PUBLIC_URL} --password '123456'"
exec ./venv/bin/gunicorn -w 1 -b "127.0.0.1:${PORT}" --access-logfile - --error-logfile - wsgi:app
