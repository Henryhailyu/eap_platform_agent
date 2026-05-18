#!/usr/bin/env sh
# I0 preflight — print deploy secrets checklist and optionally run verify_pilot.py.
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKEND="$(dirname "$0")/.."
cd "$BACKEND"

usage() {
  echo "Usage: $0 [--verify BASE_URL] [--password PASS]"
  echo "  $0                          Print env checklist + generated EAP_SECRET_KEY"
  echo "  $0 --verify http://127.0.0.1:5051"
  echo "  $0 --verify https://your-app.onrender.com --password 'YourStrongPassword'"
  exit 0
}

BASE=""
PASS="123456"
while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage ;;
    --verify) BASE="${2:?--verify needs URL}"; shift 2 ;;
    --password) PASS="${2:?--password needs value}"; shift 2 ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

SECRET="$(openssl rand -hex 32)"

echo "=== EAP I0 preflight ==="
echo ""
echo "Repo: $ROOT"
echo ""
echo "1) Copy these for Render / Docker / VPS (never commit real .env):"
echo ""
echo "   EAP_SECRET_KEY=$SECRET"
echo "   EAP_PUBLIC_URL=https://YOUR-SERVICE.onrender.com"
echo "   EAP_ENV=production"
echo "   EAP_PILOT_MODE=1"
echo "   EAP_PRODUCTION_PRESET=1"
echo "   EAP_TRUST_PROXY=1"
echo "   EAP_DATABASE_PATH=/data/eap_platform.db"
echo "   EAP_UPLOAD_DIR=/data/uploads"
echo "   EAP_SUBMISSIONS_DIR=/data/submissions"
echo ""
echo "2) Hosting:"
echo "   Render: push to GitHub → New Blueprint → select repo (render.yaml)"
echo "   Docker: cd $ROOT && docker compose up --build -d"
echo ""
echo "3) After first deploy, set EAP_PUBLIC_URL to your HTTPS URL and redeploy."
echo ""
echo "4) Rotate passwords (mandatory before students):"
echo "   EAP_PILOT_DEFAULT_PASSWORD='YourStrongPassword' python scripts/seed_pilot.py"
echo "   (Docker: docker compose exec eap sh -c 'EAP_PILOT_DEFAULT_PASSWORD=... python scripts/seed_pilot.py')"
echo ""
echo "5) Verify:"
echo "   python scripts/verify_pilot.py --base https://YOUR-URL --password 'YourStrongPassword'"
echo ""
echo "6) Phone test: https://YOUR-URL/ui/student.html and /ui/teacher.html"
echo ""
echo "Docs: $ROOT/docs/PILOT_DEPLOY.md"
echo ""

if command -v docker >/dev/null 2>&1; then
  echo "Docker: installed"
else
  echo "Docker: not found (optional — use Render or install Docker Desktop)"
fi

if [ -n "$BASE" ]; then
  echo ""
  echo "Running verify_pilot against $BASE ..."
  if [ ! -d venv ]; then
    python3 -m venv venv
    ./venv/bin/pip install -q -r requirements.txt
  fi
  exec ./venv/bin/python scripts/verify_pilot.py --base "$BASE" --password "$PASS"
fi
