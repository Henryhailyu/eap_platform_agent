#!/usr/bin/env sh
# Point origin at Henryhailyu's repo and push main (create repo on GitHub first if needed).
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
REMOTE="https://github.com/Henryhailyu/eap_platform_agent.git"
git remote set-url origin "$REMOTE" 2>/dev/null || git remote add origin "$REMOTE"
echo "Remote: $(git remote get-url origin)"
echo ""
echo "If the repo does not exist yet, create it (empty, no README):"
echo "  https://github.com/new?name=eap_platform_agent"
echo ""
if ! curl -sf -o /dev/null "https://api.github.com/repos/Henryhailyu/eap_platform_agent"; then
  echo "Repository not found on GitHub yet."
  echo "Create it (empty, no README): https://github.com/new?name=eap_platform_agent"
  echo "Then run this script again."
  exit 1
fi
git push -u origin main
