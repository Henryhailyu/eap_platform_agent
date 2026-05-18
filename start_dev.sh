#!/usr/bin/env sh
# Start local API from project root (avoids "cd backend" when already in backend).
exec "$(dirname "$0")/backend/scripts/start_pilot_dev.sh"
