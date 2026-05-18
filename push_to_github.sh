#!/usr/bin/env sh
# One-time: add SSH key at https://github.com/settings/keys (public key is in clipboard after setup).
set -e
cd "$(dirname "$0")"
git remote set-url origin git@github.com:Henryhailyu/eap_platform_agent.git
echo "Remote: $(git remote get-url origin)"
echo "Pushing main..."
git push -u origin main
echo ""
echo "Verify on GitHub:"
git ls-remote origin HEAD
echo "Done — open https://github.com/Henryhailyu/eap_platform_agent"
