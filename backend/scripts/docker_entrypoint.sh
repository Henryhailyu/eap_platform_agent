#!/bin/sh
set -e
cd /app/backend

DATA_DIR="${EAP_DATA_DIR:-/data}"
SEED_MARKER="${DATA_DIR}/.eap_seeded"

UPLOAD_ROOT="${EAP_UPLOAD_DIR:-/data/uploads}"
mkdir -p "${UPLOAD_ROOT}/classroom-display/previews" "${UPLOAD_ROOT}/recorded-lessons" "${EAP_SUBMISSIONS_DIR:-/data/submissions}"

echo "EAP pilot: initializing database at ${EAP_DATABASE_PATH:-/data/eap_platform.db}"
python -c "from app import init_database; init_database()"

if [ -n "${EAP_PILOT_DEFAULT_PASSWORD:-}" ]; then
  echo "EAP pilot: syncing demo account passwords"
  python scripts/seed_pilot.py
fi

run_seeds=0
if [ "${EAP_FORCE_SEED:-0}" = "1" ]; then
  run_seeds=1
elif [ ! -f "${SEED_MARKER}" ]; then
  run_seeds=1
fi

if [ "${run_seeds}" = "1" ]; then
  if [ "${EAP_SEED_PILOT:-0}" = "1" ]; then
    echo "EAP pilot: running seed_pilot.py"
    python scripts/seed_pilot.py
  fi
  if [ "${EAP_SEED_DEMO_TASKS:-0}" = "1" ]; then
    echo "EAP pilot: running seed_internal_demo.py"
    python scripts/seed_internal_demo.py
  fi
  touch "${SEED_MARKER}"
  echo "EAP pilot: seed complete (marker ${SEED_MARKER})"
else
  echo "EAP pilot: skipping seeds (already seeded; set EAP_FORCE_SEED=1 to re-run)"
fi

# SQLite on /data: use one worker (multi-worker causes lock/crash on Render).
WORKERS="${GUNICORN_WORKERS:-1}"
BIND="0.0.0.0:${PORT:-5051}"
echo "EAP pilot: starting gunicorn on ${BIND} (${WORKERS} workers)"
exec gunicorn -w "${WORKERS}" -b "${BIND}" --timeout 120 --access-logfile - --error-logfile - wsgi:app
