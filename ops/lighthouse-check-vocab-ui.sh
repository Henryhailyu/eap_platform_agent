#!/usr/bin/env bash
# Verify vocabulary server UI assets inside Docker (run on Lighthouse after git pull).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Checking vocabulary server UI in container…"
sudo docker compose exec -T eap test -f /app/frontend/js/student-self-study-vocabulary-ui.js
sudo docker compose exec -T eap grep -q "EAP_VOCAB_UI" /app/frontend/js/student-self-study-vocabulary-ui.js
sudo docker compose exec -T eap grep -q "bootVocabularyModule" /app/frontend/js/student-self-study-module.js

CODE="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5051/ui/js/student-self-study-vocabulary-ui.js)"
echo "HTTP /ui/js/student-self-study-vocabulary-ui.js → $CODE"
test "$CODE" = "200"

HTML="$(curl -s http://127.0.0.1:5051/ui/student-self-study-module.html | head -c 4000)"
echo "$HTML" | grep -q "student-self-study-vocabulary-ui.js" || {
  echo "error: HTML missing vocabulary-ui.js script tag — browser may be on cached old page" >&2
  exit 1
}
echo "OK — rebuild with: sudo docker compose up -d --build"
