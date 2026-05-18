# Phase G — online web pilot (Flask API + /ui/ frontend, SQLite on a persistent volume)
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-prod.txt /app/
COPY backend/requirements.txt /app/backend/
RUN pip install --no-cache-dir -r /app/requirements-prod.txt

COPY backend/ /app/backend/
COPY frontend/ /app/frontend/

RUN chmod +x /app/backend/scripts/docker_entrypoint.sh \
    && mkdir -p /data/uploads /data/submissions

ENV PYTHONUNBUFFERED=1 \
    PORT=5051 \
    EAP_ENV=production \
    EAP_PILOT_MODE=1 \
    EAP_PRODUCTION_PRESET=1 \
    EAP_TRUST_PROXY=1 \
    EAP_DATABASE_PATH=/data/eap_platform.db \
    EAP_UPLOAD_DIR=/data/uploads \
    EAP_SUBMISSIONS_DIR=/data/submissions \
    EAP_SEED_PILOT=1 \
    EAP_SEED_DEMO_TASKS=1

VOLUME ["/data"]
EXPOSE 5051

ENTRYPOINT ["/app/backend/scripts/docker_entrypoint.sh"]
