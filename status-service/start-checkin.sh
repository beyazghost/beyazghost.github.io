#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if [ ! -f .env ]; then
  echo "No .env file found in $ROOT_DIR"
  echo "Create one from .env.example and set JOURNO_STATUS_API and JOURNO_STATUS_TOKEN."
  exit 1
fi

nohup env $(grep -v '^#' .env | xargs) node checkin.js >/tmp/journo-checkin.log 2>&1 &
echo "Started status check-in loop in the background."
echo "Logs: /tmp/journo-checkin.log"
