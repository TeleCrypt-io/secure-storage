#!/usr/bin/env bash
# Stop and remove the throwaway Synapse container.
#
#   ./down.sh          # stop + remove container (keeps ./data for a fast restart)
#   ./down.sh --wipe   # also delete ./data (full reset)
set -euo pipefail

cd "$(dirname "$0")"
NAME="throwaway-synapse"

podman rm -f "$NAME" >/dev/null 2>&1 && echo "==> removed $NAME" || echo "==> $NAME was not running"

if [[ "${1:-}" == "--wipe" ]]; then
  # Data is owned by the container-mapped UID (rootless podman); delete inside
  # the user namespace so the host user is allowed to remove it.
  podman unshare rm -rf "$PWD/data" 2>/dev/null || rm -rf "$PWD/data"
  echo "==> wiped ./data"
fi
