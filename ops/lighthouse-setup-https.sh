#!/usr/bin/env bash
# Lighthouse — Nginx + Let's Encrypt for EAP after ICP 备案 passes.
# Run on the server as a user with sudo (ubuntu on Tencent Lighthouse).
#
# Prerequisites (you):
#   1. ICP 备案 approved for domain
#   2. DNS A record: your domain → this server's public IP
#   3. Tencent firewall: TCP 80 and 443 open to 0.0.0.0/0
#   4. EAP Docker app running on 127.0.0.1:5051 (see below)
#
# Usage:
#   cd ~/eap_platform_agent
#   chmod +x ops/lighthouse-setup-https.sh
#   sudo EAP_DOMAIN=elc-eap-platform.top ./ops/lighthouse-setup-https.sh
#
set -euo pipefail

EAP_DOMAIN="${EAP_DOMAIN:-elc-eap-platform.top}"
EAP_PROJECT_DIR="${EAP_PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
EAP_UPSTREAM_PORT="${EAP_UPSTREAM_PORT:-5051}"
NGINX_SITE="/etc/nginx/sites-available/eap-platform"
NGINX_ENABLED="/etc/nginx/sites-enabled/eap-platform"

echo "==> EAP HTTPS setup for domain: ${EAP_DOMAIN}"
echo "    Project: ${EAP_PROJECT_DIR}"
echo "    Upstream: 127.0.0.1:${EAP_UPSTREAM_PORT}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Re-run with sudo." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker not found. Install EAP stack first." >&2
  exit 1
fi

if ! curl -sf "http://127.0.0.1:${EAP_UPSTREAM_PORT}/api/health" >/dev/null; then
  echo "WARN: http://127.0.0.1:${EAP_UPSTREAM_PORT}/api/health not reachable."
  echo "      Start EAP first: cd ${EAP_PROJECT_DIR} && docker compose up -d"
  read -r -p "Continue anyway? [y/N] " ans
  [[ "${ans:-}" =~ ^[Yy]$ ]] || exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y nginx certbot python3-certbot-nginx

mkdir -p /var/www/certbot

render_nginx() {
  local template="$1"
  sed "s/__DOMAIN__/${EAP_DOMAIN}/g" "${template}" > "${NGINX_SITE}"
}

# Phase 1: HTTP-only — SSL paths do not exist until certbot runs.
echo "==> Phase 1: HTTP bootstrap (no SSL yet)..."
render_nginx "${EAP_PROJECT_DIR}/ops/nginx/eap-platform-http-bootstrap.conf.template"
ln -sf "${NGINX_SITE}" "${NGINX_ENABLED}"
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
dpkg --configure -a 2>/dev/null || true
nginx -t
systemctl enable nginx
systemctl restart nginx

echo "==> Requesting Let's Encrypt certificate..."
if [[ -n "${CERTBOT_EMAIL:-}" ]]; then
  certbot --nginx -d "${EAP_DOMAIN}" --non-interactive --agree-tos --redirect --email "${CERTBOT_EMAIL}"
else
  certbot --nginx -d "${EAP_DOMAIN}" --non-interactive --agree-tos --redirect --register-unsafely-without-email
fi

# Phase 2: full reverse-proxy config (certs + options-ssl-nginx.conf now exist).
echo "==> Phase 2: applying full HTTPS proxy config..."
render_nginx "${EAP_PROJECT_DIR}/ops/nginx/eap-platform.conf.template"
nginx -t
systemctl reload nginx

ENV_FILE="${EAP_PROJECT_DIR}/.env"
if [[ -f "${ENV_FILE}" ]]; then
  echo "==> Updating ${ENV_FILE} (backup at ${ENV_FILE}.bak.https)"
  cp "${ENV_FILE}" "${ENV_FILE}.bak.https"
  grep -v '^EAP_PUBLIC_URL=' "${ENV_FILE}" | grep -v '^EAP_SESSION_COOKIE_SECURE=' > "${ENV_FILE}.tmp" || true
  {
    cat "${ENV_FILE}.tmp" 2>/dev/null || true
    echo "EAP_PUBLIC_URL=https://${EAP_DOMAIN}"
    echo "EAP_SESSION_COOKIE_SECURE=1"
    echo "EAP_TRUST_PROXY=1"
  } > "${ENV_FILE}"
  rm -f "${ENV_FILE}.tmp"
  echo "    Updated EAP_PUBLIC_URL, EAP_SESSION_COOKIE_SECURE, EAP_TRUST_PROXY"
else
  echo "WARN: ${ENV_FILE} not found — set manually:"
  echo "  EAP_PUBLIC_URL=https://${EAP_DOMAIN}"
  echo "  EAP_SESSION_COOKIE_SECURE=1"
  echo "  EAP_TRUST_PROXY=1"
fi

echo ""
echo "==> Done. Next steps (as ubuntu, not necessarily root):"
echo "  1. Bind Docker to localhost only (recommended) — in docker-compose.yml:"
echo "       ports: [\"127.0.0.1:5051:5051\"]"
echo "  2. Reload app:"
echo "       cd ${EAP_PROJECT_DIR}"
echo "       set -a && source .env && set +a"
echo "       sudo docker compose up -d --force-recreate"
echo "  3. Verify:"
echo "       curl -s https://${EAP_DOMAIN}/api/health"
echo "       Open https://${EAP_DOMAIN}/ui/student.html in browser"
echo ""
echo "Certificate auto-renew: certbot renew (systemd timer installed by certbot package)."
