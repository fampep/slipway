#!/usr/bin/env bash
# Run ON the Linux dedi (no root required if user is in the docker group).
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/slipway}"
cd "$APP_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin is required."
  exit 1
fi

echo "==> Building Slipway image (Linux amd64)"
docker compose build

echo "==> Starting Slipway (bound to 127.0.0.1:8080)"
docker compose up -d

echo "==> Status"
docker compose ps
docker logs --tail 40 slipway || true
echo "Panel: tunnel to http://127.0.0.1:8080 from your PC"
