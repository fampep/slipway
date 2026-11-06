# Slipway roadmap

Prioritized list of things to **add**, **improve**, and **fix**.  
Higher = sooner. Check items off as they ship.

---

## Now / next (P0)

- [x] One-liner install (`curl | bash`)
- [x] Dark UI + Overview hero
- [x] Host app detect (Silo etc.)
- [x] App detail: logs / inspect / stats
- [x] Paste GitHub / compose / image → catalog
- [x] Health badges, updates, bulk actions
- [x] Proxy snippets + export + mobile nav
- [x] **Faster install:** pull prebuilt `ghcr.io` image when published (fallback: local build)
- [x] Install script waits for healthy panel + prints clear next step
- [x] Toast feedback for install / start / stop / save
- [x] Catalog “featured media” row + richer empty states
- [x] Compose healthcheck + uninstall flag
- [x] Publish workflow for GHCR (`ghcr.io/fampep/slipway`)
- [ ] First-run: auto-suggest public URL from host IP
- [ ] “Open” links always use Settings public URL + port + path

---

## Install & ops (P1)

- [ ] `slipway update` helper script in PATH (or alias printed after install)
- [ ] Optional bind `127.0.0.1` vs `0.0.0.0` (`SLIPWAY_BIND`)
- [ ] Port-in-use detection with friendly fix hint
- [ ] Uninstall script (`install.sh --uninstall`)
- [ ] Backup panel data volume one-liner
- [ ] Healthcheck in compose (`/api/health`)
- [ ] Auto-restart on crash (already `unless-stopped` — document)
- [ ] Version badge in Settings (git tag / build time)
- [ ] Changelog page or “What’s new” after update

---

## Apps & catalog (P1)

- [ ] More catalog apps: Jellyseerr, Overseerr, Bazarr, Tdarr, Nzbget, SABnzbd, Kavita, Audiobookshelf, Homarr, Portainer, Uptime Kuma, Vaultwarden, Nextcloud, Immich
- [ ] App tags: `media`, `download`, `request`, `tools`, `storage`
- [ ] Featured / recommended install order (Arr stack wizard)
- [ ] Per-app env editor before install
- [ ] Per-app volume path picker (host folders)
- [ ] Port conflict warning before install
- [ ] Default path for Open (`/web`, `/` etc.)
- [ ] Delete custom imported apps from UI
- [ ] Import from docker-compose paste (multi-service)
- [ ] Stack grouping: treat compose project as one app with children
- [ ] Pin / favorite apps on Overview
- [ ] Search by image name / port

---

## Reliability & health (P1)

- [ ] HTTP health probes (`health_url` in catalog)
- [ ] Unhealthy → Overview attention (done for Docker health) + optional webhook
- [ ] Auto-restart policy UI toggle
- [ ] Disk full warning thresholds (configurable)
- [ ] Container die notification (webhook / Discord)
- [ ] Log download button (txt)
- [ ] Live log tail (SSE/WebSocket), not only snapshot
- [ ] Resource limits soft warnings (CPU/mem hot)

---

## Updates (P1)

- [ ] “Check all for updates” button
- [ ] Show digest short hash on app page
- [ ] Update all managed apps (queue)
- [ ] Watchtower-style optional auto-update (opt-in)
- [ ] Rollback to previous image id (best effort)

---

## UI / UX (P1–P2)

- [ ] Global toast system
- [ ] Confirm modals that aren’t browser `confirm()`
- [ ] Keyboard shortcuts (`/` search, `g a` apps)
- [ ] Command palette (install / open / restart)
- [ ] Better mobile app actions (full-width sticky bar)
- [ ] Skeleton loaders instead of “Loading…”
- [ ] Relative time (“started 2h ago”)
- [ ] Dark theme polish pass (spacing scale, type scale)
- [ ] Empty states with one obvious next action everywhere
- [ ] Onboarding checklist after first login
- [ ] Accessibility: focus rings, aria labels, contrast audit

---

## Security & access (P2)

- [ ] HTTPS docs only (keep short) + Caddy recipe tested
- [ ] Session expiry / “remember me”
- [ ] Change password in Settings
- [ ] Optional 2FA (TOTP)
- [ ] CSRF already cookie-based — audit
- [ ] Read-only viewer role
- [ ] Audit log (who installed/stopped what)
- [ ] Secrets never in export JSON by default

---

## Networking (P2)

- [ ] Per-app reverse-proxy snippet (not only panel)
- [ ] Traefik labels generator
- [ ] Optional Cloudflare Tunnel recipe (opt-in, not required)
- [ ] Custom domain map: `jellyfin.example.com` → container port
- [ ] Show LAN vs WAN URLs

---

## Data & storage (P2)

- [ ] Media library path presets (`/home/.../storage/media`)
- [ ] Disk health SMART summary if available
- [ ] Quota / big-folder finder (top usage)
- [ ] Backup app config dirs
- [ ] Move data dir wizard

---

## Platform (P2–P3)

- [ ] Multi-host (remote Docker contexts) — later
- [ ] ARM64 images
- [ ] Podman compatibility note / test
- [ ] Windows host: not a goal (Linux only)
- [ ] Kubernetes: out of scope

---

## Docs & community (P2)

- [ ] `docs/apps.md` — how to write a catalog YAML
- [ ] Screenshot / short demo GIF in README
- [ ] Contributing guide
- [ ] Issue / feature request templates
- [ ] Discord or Discussions link (optional)

---

## Nice-to-have (P3)

- [ ] Themes (accent color picker)
- [ ] Widgets on Overview (custom layout)
- [ ] Built-in terminal to container
- [ ] File browser integration deep-link
- [ ] Stats history graphs (24h)
- [ ] Mobile PWA install
- [ ] i18n

---

## Explicitly out of scope (for now)

- Full Kubernetes control plane
- Marketplace billing
- Replacing Portainer / RunTipi entirely
- Windows as the Docker host

---

## How we ship

1. Keep README short (install + what you get).
2. Put detail here in `ROADMAP.md`.
3. Prefer one-liner install; never require tunnels for the happy path.
4. Every push should say what improved / fixed.
