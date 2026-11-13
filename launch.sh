#!/usr/bin/env bash
set -euo pipefail

CONTAINER=$(docker ps --filter ancestor=4e-dm-dashboard-dev --format '{{.ID}}' | head -1)

if [ -z "$CONTAINER" ]; then
    echo "No running 4e-dm-dashboard-dev container found. Start one with ./dev.sh first."
    exit 1
fi

# The container can't see the desktop's color scheme (no session D-Bus, so no
# xdg-desktop-portal), so Electron there always reports light. Read the host's
# preference here and force dark mode if it's set. The in-app Light/Dark
# choices still override this; only "Follow system" depends on it, and it
# won't follow OS changes until the next launch.
EXTRA_FLAGS=()
if busctl --user call org.freedesktop.portal.Desktop /org/freedesktop/portal/desktop \
    org.freedesktop.portal.Settings ReadOne ss org.freedesktop.appearance color-scheme \
    2>/dev/null | grep -q ' 1$'; then
    EXTRA_FLAGS+=(--force-dark-mode)
fi

docker exec -it "$CONTAINER" \
    npx electron-vite dev -- --ozone-platform=wayland --enable-logging "${EXTRA_FLAGS[@]}" 2>&1 | tee /tmp/electron.log
