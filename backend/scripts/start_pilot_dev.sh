#!/usr/bin/env sh
# Local pilot API for web UI + WeChat DevTools (port 5051).
set -e
cd "$(dirname "$0")/.."
if [ ! -d venv ]; then
  python3 -m venv venv
  ./venv/bin/pip install -q -r requirements.txt
fi
export EAP_REQUIRE_SESSION_IDENTITY=1
export EAP_ENFORCE_MEMBERSHIP=1
echo "Starting EAP on http://127.0.0.1:5051 (also use http://localhost:5051 in wechat-mini/config.js)"
exec ./venv/bin/python app.py
