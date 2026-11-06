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
- [x] First-run: auto-suggest public URL from host IP
- [x] “Open” links always use Settings public URL + port + path

---

## Install & ops (P1)

- [x] `slipway update` helper script (`scripts/slipway-update.sh`)
- [x] Optional bind `127.0.0.1` vs `0.0.0.0` (`SLIPWAY_BIND`)
- [x] Port-in-use detection with friendly fix hint (catalog port check)
- [x] Uninstall script (`install.sh --uninstall`)
- [x] Backup panel data volume one-liner (printed by install)
- [x] Healthcheck in compose (`/api/health`)
- [x] Auto-restart on crash (already `unless-stopped` — documented)
- [x] Version badge in Settings
- [ ] Changelog page or “What’s new” after update

---

## Apps & catalog (P1)

- [x] More catalog apps: Jellyseerr, Overseerr, Bazarr, Tdarr, NZBGet, SABnzbd, Kavita, Audiobookshelf, Homarr, Portainer, Uptime Kuma, Vaultwarden, Nextcloud, Immich
- [x] App tags: `media`, `download`, `request`, `tools`, `storage`
- [ ] Featured / recommended install order (Arr stack wizard)
- [x] Per-app env editor before install (JSON env overrides on install API; UI can pass env)
- [ ] Per-app volume path picker (host folders)
- [x] Port conflict warning before install
- [x] Default path for Open (`default_path`)
- [x] Delete custom imported apps from UI
- [ ] Import from docker-compose paste (multi-service)
- [x] Stack grouping: compose project siblings on app page
- [x] Pin / favorite apps on Overview
- [x] Search by image name / port (catalog search covers name/desc/category; tags shown)

---

## Reliability & health (P1)

- [x] HTTP health probes (`health_url` in catalog when Docker health empty)
- [x] Unhealthy → Overview attention
- [ ] Optional webhook fire on die/install fail (setting stored; delivery next)
- [ ] Auto-restart policy UI toggle
- [ ] Disk full warning thresholds (configurable)
- [ ] Container die notification (webhook / Discord) — wiring pending
- [x] Log download button (txt)
- [ ] Live log tail (SSE/WebSocket), not only snapshot
- [ ] Resource limits soft warnings (CPU/mem hot)

---

## Updates (P1)

- [x] “Check all for updates” button
- [x] Show image id / started relative time on app page
- [ ] Update all managed apps (queue)
- [ ] Watchtower-style optional auto-update (opt-in)
- [ ] Rollback to previous image id (best effort)

---

## UI / UX (P1–P2)

- [x] Global toast system
- [ ] Confirm modals that aren’t browser `confirm()`
- [ ] Keyboard shortcuts (`/` search, `g a` apps)
- [ ] Command palette (install / open / restart)
- [x] Better mobile app actions (bottom nav already)
- [ ] Skeleton loaders instead of “Loading…”
- [x] Relative time (“started 2h ago”)
- [x] Dark theme polish pass (landing + overview hero)
- [x] Empty states with one obvious next action everywhere
- [x] Onboarding checklist after first login
- [ ] Accessibility: focus rings, aria labels, contrast audit

---

## Security & access (P2)

- [x] HTTPS docs / Caddy+nginx recipes in Settings
- [ ] Session expiry / “remember me”
- [x] Change password in Settings
- [ ] Optional 2FA (TOTP)
- [ ] CSRF already cookie-based — audit
- [ ] Read-only viewer role
- [ ] Audit log (who installed/stopped what)
- [x] Secrets never in export JSON by default (export is settings + custom apps only)

---

## Networking (P2)

- [x] Per-app reverse-proxy snippet (app Connect tab)
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
- [x] Windows host: not a goal (Linux only)
- [x] Kubernetes: out of scope

---

## Docs & community (P2)

- [x] `docs/apps.md` — how to write a catalog YAML
- [ ] Screenshot / short demo GIF in README
- [x] Contributing guide
- [x] Issue / feature request templates
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
