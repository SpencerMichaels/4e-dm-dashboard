#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="tabletop-dev"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Build image if it doesn't exist or --build flag passed
if [[ "${1:-}" == "--build" ]]; then
    shift
    FORCE_BUILD=true
else
    FORCE_BUILD=false
fi

if [[ "$FORCE_BUILD" == true ]] || ! docker image inspect "$IMAGE_NAME" &>/dev/null; then
    echo "Building devcontainer image..."
    docker build -f "$SCRIPT_DIR/.devcontainer/Dockerfile" -t "$IMAGE_NAME" "$SCRIPT_DIR/.devcontainer/"
fi

exec docker run -it --rm \
    --cap-add=NET_ADMIN \
    --cap-add=NET_RAW \
    -v "$SCRIPT_DIR":/workspace \
    -v tabletop-bashhistory:/commandhistory \
    -v tabletop-codex-config:/home/node/.codex \
    -v "$XDG_RUNTIME_DIR/$WAYLAND_DISPLAY:/tmp/wayland-0" \
    -e WAYLAND_DISPLAY=wayland-0 \
    -e XDG_RUNTIME_DIR=/tmp \
    -e ELECTRON_OZONE_PLATFORM_HINT=auto \
    -e ELECTRON_DISABLE_SANDBOX=1 \
    -e LIBGL_ALWAYS_SOFTWARE=1 \
    -e ELECTRON_ENABLE_LOGGING=1 \
    -e CODEX_HOME=/home/node/.codex \
    --device /dev/dri \
    "$IMAGE_NAME" \
    bash -c 'sudo /usr/local/bin/init-firewall.sh && exec codex "$@"' bash "$@"
