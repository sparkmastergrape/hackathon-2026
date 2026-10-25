#!/usr/bin/env bash
# Speculos lifecycle for the Mandate spike.
#   ./scripts/speculos.sh up      download the ETH app ELF + start the emulator
#   ./scripts/speculos.sh down    stop it
#   ./scripts/speculos.sh screen  print the current device screen
#
# Port 5010 is deliberate: 5000/5001 are often taken by other Speculos
# instances on this machine. Never kill a container you did not start.
set -euo pipefail

APP_VERSION="1.23.0"
MODEL="nanox"
PORT="${SPECULOS_PORT:-5010}"
NAME="speculos-eth-mandate"
APPS_DIR="${SPECULOS_APPS_DIR:-$HOME/.speculos-apps}"
ELF="$APPS_DIR/eth-$MODEL.elf"
URL="https://github.com/LedgerHQ/app-ethereum/releases/download/$APP_VERSION/app-$APP_VERSION-$MODEL.elf"

case "${1:-up}" in
  up)
    mkdir -p "$APPS_DIR"
    if [ ! -f "$ELF" ]; then
      echo "downloading app-ethereum $APP_VERSION ($MODEL)…"
      curl -sL -o "$ELF" "$URL"
    fi
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    MSYS_NO_PATHCONV=1 docker run --rm -d --name "$NAME" \
      -p "$PORT:5000" -v "$APPS_DIR:/apps" \
      ghcr.io/ledgerhq/speculos:latest \
      --model "$MODEL" --display headless --api-port 5000 \
      "/apps/eth-$MODEL.elf" >/dev/null
    for _ in $(seq 1 10); do
      if curl -sf -m 3 "http://localhost:$PORT/events?currentscreenonly=true" >/dev/null 2>&1; then
        echo "speculos up on http://localhost:$PORT"
        exit 0
      fi
    done
    echo "speculos did not become ready; docker logs $NAME" >&2
    exit 1
    ;;
  down)
    docker rm -f "$NAME" >/dev/null 2>&1 && echo "stopped $NAME" || echo "not running"
    ;;
  screen)
    curl -s "http://localhost:$PORT/events?currentscreenonly=true"
    echo
    ;;
  *)
    echo "usage: $0 {up|down|screen}" >&2
    exit 2
    ;;
esac
