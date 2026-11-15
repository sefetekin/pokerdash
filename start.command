#!/bin/bash
# Starts the pokerbot dashboard. Stops an older copy first so the newest code always runs.
cd "$(dirname "$0")"
OLD=$(lsof -ti tcp:8000 -sTCP:LISTEN 2>/dev/null)
if [ -n "$OLD" ]; then
  echo "Stopping the dashboard that was already running (pid $OLD)..."
  kill $OLD 2>/dev/null
  sleep 1
fi
python3 app.py
