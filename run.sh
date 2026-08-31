#!/usr/bin/env bash
# Serves the app with Python's built-in static file server.
set -euo pipefail
PORT="${1:-8000}"
cd "$(dirname "$0")"
echo "Serving knesset-guessr on http://localhost:${PORT}/"
python3 -m http.server "$PORT"
