#!/usr/bin/env bash
# Launch a throwaway single-container Synapse for functional tests, via podman.
# Idempotent: safe to run repeatedly. Generates config on first run, reuses it after.
#
#   ./up.sh          # start (generate config if missing)
#   ./up.sh --fresh  # wipe data and regenerate from scratch
#
# Verify it is up:  curl http://localhost:8008/_matrix/client/versions
set -euo pipefail

cd "$(dirname "$0")"

IMAGE="ghcr.io/element-hq/synapse:latest"
NAME="throwaway-synapse"
DATA="$PWD/data"
PORT=8008

if [[ "${1:-}" == "--fresh" ]]; then
  echo "==> --fresh: removing container and data"
  podman rm -f "$NAME" >/dev/null 2>&1 || true
  # Data is owned by the container-mapped UID under rootless podman, so a plain
  # host `rm` is denied. Delete inside the user namespace instead.
  podman unshare rm -rf "$DATA" 2>/dev/null || rm -rf "$DATA"
fi

mkdir -p "$DATA"

# 1. Generate the base config once (creates homeserver.yaml + signing key).
if [[ ! -f "$DATA/homeserver.yaml" ]]; then
  echo "==> generating base Synapse config"
  podman run --rm \
    -v "$DATA:/data:Z" \
    -e SYNAPSE_SERVER_NAME=localhost \
    -e SYNAPSE_REPORT_STATS=no \
    "$IMAGE" generate

  # 2. Append our throwaway overrides (open registration, no rate limits).
  #    Done INSIDE a container: rootless podman maps /data to the container's UID,
  #    so the generated homeserver.yaml is not writable from the host.
  echo "==> appending homeserver.extra.yaml"
  podman run --rm \
    -v "$DATA:/data:Z" \
    -v "$PWD/homeserver.extra.yaml:/extra.yaml:ro,Z" \
    --entrypoint /bin/sh \
    "$IMAGE" -c 'printf "\n# ---- throwaway test overrides ----\n" >> /data/homeserver.yaml && cat /extra.yaml >> /data/homeserver.yaml'
fi

# 3. (Re)start the container.
podman rm -f "$NAME" >/dev/null 2>&1 || true
echo "==> starting $NAME on :$PORT"
podman run -d --name "$NAME" \
  -p "$PORT:8008" \
  -v "$DATA:/data:Z" \
  "$IMAGE" >/dev/null

# 4. Wait for health.
echo -n "==> waiting for Synapse to be ready"
for i in $(seq 1 60); do
  if curl -fsS -m2 "http://localhost:$PORT/_matrix/client/versions" >/dev/null 2>&1; then
    echo " — ready"
    echo "Synapse is up at http://localhost:$PORT"
    exit 0
  fi
  echo -n "."
  sleep 1
done

echo ""
echo "ERROR: Synapse did not become ready in 60s. Logs:" >&2
podman logs --tail 40 "$NAME" >&2 || true
exit 1
