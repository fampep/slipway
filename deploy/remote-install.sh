#!/usr/bin/env bash
# Run from the Slipway project directory on Linux.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required."
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin is required."
  exit 1
fi

if getent group docker >/dev/null 2>&1; then
  export DOCKER_GID="$(getent group docker | cut -d: -f3)"
fi
export DOCKER_GID="${DOCKER_GID:-991}"
export SLIPWAY_PORT="${SLIPWAY_PORT:-8080}"

echo "==> Building Slipway"
docker compose build

echo "==> Starting on port ${SLIPWAY_PORT}"
docker compose up -d

echo "==> Status"
docker compose ps
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo "Open http://${IP:-YOUR_SERVER_IP}:${SLIPWAY_PORT}"
