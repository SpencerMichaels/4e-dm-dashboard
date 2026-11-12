#!/usr/bin/env bash
set -euo pipefail

CONTAINER=$(docker ps --filter ancestor=4e-dm-dashboard-dev --format '{{.ID}}' | head -1)

if [ -z "$CONTAINER" ]; then
    echo "No running 4e-dm-dashboard-dev container found. Start one with ./dev.sh first."
    exit 1
fi

docker exec -it "$CONTAINER" \
    npx electron-vite dev -- --ozone-platform=wayland --enable-logging 2>&1 | tee /tmp/electron.log
