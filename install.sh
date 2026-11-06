#!/usr/bin/env bash
# Install Slipway on Linux with Docker.
# curl -fsSL https://raw.githubusercontent.com/fampep/slipway/main/install.sh | bash
set -euo pipefail

REPO="${SLIPWAY_REPO:-https://github.com/fampep/slipway.git}"
DIR="${SLIPWAY_DIR:-$HOME/slipway}"
PORT="${SLIPWAY_PORT:-8080}"
BRANCH="${SLIPWAY_BRANCH:-main}"

echo "==> Slipway install"
echo "    dir:  $DIR"
echo "    port: $PORT"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required. Install Docker, then re-run."
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin is required."
  exit 1
fi
if ! command -v git >/dev/null 2>&1; then
  echo "git is required."
  exit 1
fi

if [[ -d "$DIR/.git" ]]; then
  echo "==> Updating existing clone"
  git -C "$DIR" fetch --depth 1 origin "$BRANCH"
  git -C "$DIR" checkout "$BRANCH"
  git -C "$DIR" pull --ff-only origin "$BRANCH"
else
  echo "==> Cloning $REPO"
  mkdir -p "$(dirname "$DIR")"
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$DIR"
fi

cd "$DIR"

if getent group docker >/dev/null 2>&1; then
  export DOCKER_GID="$(getent group docker | cut -d: -f3)"
else
  export DOCKER_GID="${DOCKER_GID:-991}"
fi
export SLIPWAY_PORT="$PORT"

echo "==> Building and starting (docker gid=$DOCKER_GID)"
docker compose up -d --build

# Best-effort public hint
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
if [[ -z "${IP:-}" ]]; then
  IP="YOUR_SERVER_IP"
fi

echo
echo "Slipway is up."
echo "Open:  http://${IP}:${PORT}"
echo "Then create your account in the browser."
echo
docker compose ps
