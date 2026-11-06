#!/usr/bin/env bash
# Slipway — simplest install on Linux + Docker
# curl -fsSL https://raw.githubusercontent.com/fampep/slipway/main/install.sh | bash
set -euo pipefail

REPO="${SLIPWAY_REPO:-https://github.com/fampep/slipway.git}"
DIR="${SLIPWAY_DIR:-$HOME/slipway}"
PORT="${SLIPWAY_PORT:-8080}"
BRANCH="${SLIPWAY_BRANCH:-main}"
IMAGE="${SLIPWAY_IMAGE:-ghcr.io/fampep/slipway:latest}"

if [[ "${1:-}" == "--uninstall" ]]; then
  echo "==> Stopping Slipway in $DIR"
  if [[ -d "$DIR" ]]; then
    (cd "$DIR" && docker compose down) || true
  fi
  echo "Data volume left in place (docker volume). Remove manually if you want a wipe."
  echo "Done."
  exit 0
fi

echo "==> Slipway"
echo "    dir:   $DIR"
echo "    port:  $PORT"
echo "    image: $IMAGE"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing: $1"
    echo "Install Docker (with Compose) and git, then re-run."
    exit 1
  fi
}

need docker
need git

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin required (docker compose)."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Cannot talk to Docker. Is the daemon running? Are you in the docker group?"
  echo "Try: sudo usermod -aG docker \"\$USER\"  then log out/in."
  exit 1
fi

# Port hint (best effort)
if command -v ss >/dev/null 2>&1; then
  if ss -ltn "( sport = :$PORT )" 2>/dev/null | grep -q ":$PORT"; then
    echo "Note: something may already be listening on :$PORT — install will still try."
  fi
fi

if [[ -d "$DIR/.git" ]]; then
  echo "==> Updating $DIR"
  git -C "$DIR" fetch --depth 1 origin "$BRANCH"
  git -C "$DIR" checkout -q "$BRANCH"
  git -C "$DIR" pull --ff-only origin "$BRANCH" || true
else
  echo "==> Cloning"
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
export SLIPWAY_IMAGE="$IMAGE"
export SLIPWAY_BIND="${SLIPWAY_BIND:-0.0.0.0}"

echo "==> Pulling prebuilt image (fast path)"
PULL_OK=0
if docker pull "$IMAGE" >/dev/null 2>&1; then
  PULL_OK=1
  echo "    using $IMAGE"
else
  echo "    pull unavailable — will build locally (first time is slower)"
fi

echo "==> Starting (docker gid=$DOCKER_GID)"
if [[ "$PULL_OK" -eq 1 ]]; then
  docker compose up -d --pull missing
else
  docker compose up -d --build
fi

# Wait for health
echo "==> Waiting for panel"
OK=0
for i in $(seq 1 40); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
    OK=1
    break
  fi
  sleep 1
done

IP=""
if command -v hostname >/dev/null 2>&1; then
  IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
fi
if [[ -z "${IP:-}" ]] && command -v ip >/dev/null 2>&1; then
  IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}')"
fi
IP="${IP:-YOUR_SERVER_IP}"

echo
if [[ "$OK" -eq 1 ]]; then
  echo "Slipway is ready."
else
  echo "Slipway container started (health check still warming up)."
fi
echo
echo "  Open →  http://${IP}:${PORT}"
echo "  Then create your account in the browser."
echo
echo "Update later:  curl -fsSL https://raw.githubusercontent.com/fampep/slipway/main/install.sh | bash"
echo "Or:            bash $DIR/scripts/slipway-update.sh"
echo "Uninstall:     bash $DIR/install.sh --uninstall"
echo "Bind localhost only: SLIPWAY_BIND=127.0.0.1 …"
echo "Backup data:   docker run --rm -v slipway_slipway-data:/data -v \"\$PWD\":/backup alpine tar czf /backup/slipway-data.tgz -C /data ."
echo
docker compose ps
