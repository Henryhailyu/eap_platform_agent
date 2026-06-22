# Phase G — online web pilot (Flask API + /ui/ frontend, SQLite on a persistent volume)
FROM python:3.12-slim

WORKDIR /app

# Faster apt on China VPS (Tencent Lighthouse); no-op elsewhere if paths differ.
RUN set -eux; \
    if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
      sed -i 's|deb.debian.org|mirrors.cloud.tencent.com|g; s|security.debian.org|mirrors.cloud.tencent.com|g' \
        /etc/apt/sources.list.d/debian.sources; \
    elif [ -f /etc/apt/sources.list ]; then \
      sed -i 's|deb.debian.org|mirrors.cloud.tencent.com|g; s|security.debian.org|mirrors.cloud.tencent.com|g' \
        /etc/apt/sources.list; \
    fi

# LibreOffice (headless) converts PPT/DOC uploads to PDF for classroom display (K6d).
# ffmpeg transcodes browser WebM speaking recordings for Tencent ASR/SOE.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        ffmpeg \
        libreoffice-writer \
        libreoffice-impress \
        libreoffice-common \
        fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-prod.txt /app/
COPY backend/requirements.txt /app/backend/
# PyPI mirror for China VPS (avoids files.pythonhosted.org timeouts on Lighthouse).
RUN pip install --no-cache-dir \
    -i https://mirrors.cloud.tencent.com/pypi/simple \
    --trusted-host mirrors.cloud.tencent.com \
    --default-timeout=120 \
    -r /app/requirements-prod.txt

COPY backend/ /app/backend/
COPY frontend/ /app/frontend/

RUN chmod +x /app/backend/scripts/docker_entrypoint.sh \
    && mkdir -p /data/uploads /data/submissions

ENV PYTHONUNBUFFERED=1 \
    HOME=/tmp \
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
