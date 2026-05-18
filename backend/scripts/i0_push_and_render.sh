#!/usr/bin/env sh
# I0: push to GitHub when repo exists, then print Render Blueprint steps.
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
REPO_API="https://api.github.com/repos/Henryhailyu/eap_platform_agent"
REMOTE="https://github.com/Henryhailyu/eap_platform_agent.git"
# SSH alternative: git@github.com:Henryhailyu/eap_platform_agent.git

git remote set-url origin "$REMOTE" 2>/dev/null || git remote add origin "$REMOTE"

if ! curl -sf -o /dev/null "$REPO_API"; then
  echo "GitHub repo not found yet."
  echo "Creating via browser: https://github.com/new?name=eap_platform_agent"
  open "https://github.com/new?name=eap_platform_agent&description=EAP+learning+pilot" 2>/dev/null || true
  echo "Create the repo (empty, no README), then run this script again."
  exit 1
fi

echo "Pushing to $REMOTE ..."
if ! GIT_TERMINAL_PROMPT=1 git push -u origin main; then
  echo ""
  echo "Push failed — log in once:"
  echo "  gh auth login   (install: https://cli.github.com/)"
  echo "  or push again and enter GitHub username + Personal Access Token as password."
  exit 1
fi

echo ""
echo "=== Render (next) ==="
echo "1. https://dashboard.render.com → New → Blueprint"
echo "2. Connect repo: Henryhailyu/eap_platform_agent"
echo "3. After deploy, optional: set EAP_PUBLIC_URL to your custom domain"
echo "4. Render shell or one-off job:"
echo "     EAP_PILOT_DEFAULT_PASSWORD='YourStrongPassword' python scripts/seed_pilot.py"
echo "5. Verify:"
echo "     python scripts/verify_pilot.py --base https://YOUR-SERVICE.onrender.com --password 'YourStrongPassword'"
