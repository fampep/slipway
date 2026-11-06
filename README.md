# Slipway

**Alpha** — early preview. APIs and UI will change.

Docker media panel for Linux. Install and manage Silo, Emby, Plex, Jellyfin, *arr, and more from a clean web UI. Detects apps already on the host.

## Install

On a Linux server with Docker:

```bash
curl -fsSL https://raw.githubusercontent.com/fampep/slipway/main/install.sh | bash
```

Open `http://YOUR_SERVER_IP:8080` → create account. Done.

The installer pulls a prebuilt image when available (fast). If not, it builds once locally.

```bash
# optional
SLIPWAY_DIR=/opt/slipway SLIPWAY_PORT=8080 bash <(curl -fsSL https://raw.githubusercontent.com/fampep/slipway/main/install.sh)

# uninstall (keeps data volume)
bash ~/slipway/install.sh --uninstall
```

## What you get

- Catalog install / start / stop / restart / update
- Host app detect + compose stack view
- Logs, inspect, stats, bulk actions
- Paste GitHub / compose / image into your catalog
- Live CPU / memory / multi-drive / network
- Proxy snippets + config export

## Update

Re-run the same one-liner, or:

```bash
cd ~/slipway && git pull && docker compose up -d --build
```

## Roadmap

Long list of planned improvements: **[ROADMAP.md](ROADMAP.md)**

## Notes

- Linux + Docker only · default port **8080**
- Put behind HTTPS / reverse proxy if public
- MIT — see [LICENSE](LICENSE)
