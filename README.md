# Slipway

**Alpha** — work in progress. Things will change.

A simple Docker control panel for your Linux box. Install media apps (Silo, Emby, Plex, Jellyfin, *arr, qBittorrent, …) from a clean web UI.

## Install

On a Linux server with Docker:

```bash
curl -fsSL https://raw.githubusercontent.com/fampep/slipway/main/install.sh | bash
```

Then open `http://YOUR_SERVER_IP:8080` and create your account.

That’s it.

### Options

```bash
# custom folder / port
SLIPWAY_DIR=/opt/slipway SLIPWAY_PORT=8080 bash <(curl -fsSL https://raw.githubusercontent.com/fampep/slipway/main/install.sh)
```

Or clone yourself:

```bash
git clone https://github.com/fampep/slipway.git
cd slipway
DOCKER_GID=$(getent group docker | cut -d: -f3) docker compose up -d --build
```

## What you get

- First-run account setup in the browser
- App catalog with install / start / stop / restart
- Detects matching apps already running on the host
- Live CPU / memory / disk / network

## Update

Re-run the install command, or:

```bash
cd ~/slipway && git pull && docker compose up -d --build
```

## Notes

- Linux + Docker only
- Panel listens on port **8080** by default (change with `SLIPWAY_PORT`)
- Put it behind HTTPS / a reverse proxy if you expose it publicly
- MIT licensed — see [LICENSE](LICENSE)
