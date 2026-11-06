# Slipway

> **Alpha** — early preview. APIs, catalog format, and UI will change. Not production-ready yet. Expect bugs and breaking updates while we build.

Docker-first control panel for media / seedbox stacks on **Linux**. Install and steer apps (Silo Server, Emby, Plex, Jellyfin, *arr, qBittorrent, …) from a modern web UI instead of living in SSH.

Inspired by tools like Swizzin — rebuilt around containers, a Go API, and an interactive panel.

## Status

| | |
|---|---|
| Maturity | **Alpha** |
| Target OS | Linux (Debian/Ubuntu dedi recommended) |
| Windows | Dev/sync only — runtime is Linux + Docker |
| Stability | Actively changing; pin commits if you depend on it |

We’re still wiring public access (nginx), polish, and broader catalog coverage. Use at your own risk on a private box.

## Features (alpha)

- First-run **setup wizard** (master account + public URL) — no terminal required after install
- Session auth (HttpOnly cookie), rate-limited login/setup, locked-down APIs
- YAML **app catalog** with install / start / stop / restart / remove via Docker
- Live host metrics over WebSocket
- Starter catalog includes **Silo Server**, Emby, Plex, Jellyfin, Sonarr, Radarr, Prowlarr, qBittorrent, Filebrowser

## Quick start (Linux + Docker)

```bash
git clone https://github.com/fampep/slipway.git
cd slipway
docker compose up -d --build
```

Panel listens on `127.0.0.1:8080` by default. Create the master account in the browser.

### From a Windows PC (sync to your dedi)

```powershell
powershell -File .\scripts\deploy-to-dedi.ps1
powershell -File .\scripts\slipway-tunnel.ps1
```

Then open http://127.0.0.1:8080

## Stack

- **Go** API (chi) + Docker Engine over the Unix socket  
- **React + Vite + Tailwind** panel  
- **SQLite** for users, sessions, settings  
- **YAML** catalog under `catalog/`

## Security notes

- All app/control endpoints require a valid session after setup  
- Setup can only run once  
- Login/setup are rate-limited  
- Do not expose the Docker socket or the panel to the public internet without TLS and your own access controls  

## Roadmap (rough)

- [ ] Stable public HTTPS path (nginx / reverse proxy recipes)  
- [ ] Richer catalog + upgrade flows  
- [ ] Multi-user / permissions  
- [ ] Hardening and docs for production  

## Contributing

PRs and issues welcome, but expect the ground to move under alpha. Prefer small, focused changes.

## License

MIT — see [LICENSE](LICENSE). Project is under active development.
