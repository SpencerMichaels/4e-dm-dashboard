#!/usr/bin/env bash
# Run the app in development mode (hot reload) in the project's Nix shell.
# Extra arguments go to Electron.
set -euo pipefail
cd "$(dirname "$0")"
nix develop -c npx electron-vite dev -- --ozone-platform=wayland --enable-logging "$@" 2>&1 | tee "${TMPDIR:-/tmp}/4e-dm-dashboard-dev.log"
