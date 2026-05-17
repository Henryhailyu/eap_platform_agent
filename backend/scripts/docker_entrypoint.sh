#!/bin/sh
set -e
cd /app/backend

echo "EAP pilot: initializing database at ${EAP_DATABASE_PATH:-/data/eap_platform.db}"
python -c "from app import init_database; init_database()"

if [ "${EAP_SEED_PILOT:-0}" = "1" ]; then
  echo "EAP pilot: running seed_pilot.py"
  python scripts/seed_pilot.py
fi

if [ "${EAP_SEED_DEMO_TASKS:-0}" = "1" ]; then
  echo "EAP pilot: running seed_internal_demo.py"
  python scripts/seed_internal_demo.py
fi

WORKERS="${GUNICORN_WORKERS:-2}"
BIND="0.0.0.0:${PORT:-5051}"
echo "EAP pilot: starting gunicorn on ${BIND} (${WORKERS} workers)"
exec gunicorn -w "${WORKERS}" -b "${BIND}" --access-logfile - --error-logfile - wsgi:app
