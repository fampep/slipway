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
- [x] Faster install via GHCR + health wait
- [x] Toasts, featured catalog, mobile nav
- [x] First-run public URL suggest + Open URL composition

---

## Install & ops (P1)

- [x] Update helper script + uninstall + backup one-liner
- [x] `SLIPWAY_BIND` + compose healthcheck + version badge
- [x] Port conflict detection
- [x] Changelog / What’s new in Settings

---

## Apps & catalog (P1)

- [x] Large catalog + tags
- [x] Arr stack wizard (recommended order)
- [x] Env overrides on install API
- [x] Media/downloads path presets (Settings → applied on install)
- [x] Port conflict warning
- [x] Default path / delete custom / pin favorites
- [x] Import docker-compose paste (multi-service)
- [x] Stack siblings on app page

---

## Reliability & health (P1)

- [x] HTTP health probes + Overview attention
- [x] Webhook on install/update fail + container die
- [x] Log download + **live log tail (SSE)**
- [x] Soft CPU/mem hot warning on app page
- [x] Disk warn % setting (stored)
- [ ] Auto-restart policy UI toggle (compose restart already default)

---

## Updates (P1)

- [x] Check all + **Update all** queue
- [x] Relative started time / image info
- [x] Opt-in auto-update flag in Settings
- [ ] Rollback to previous image id

---

## UI / UX (P1–P2)

- [x] Toasts + confirm dialogs + focus rings
- [x] Onboarding checklist + empty states
- [x] Accent color picker
- [ ] Keyboard shortcuts / command palette
- [ ] Full skeleton loaders everywhere
- [ ] Accessibility audit pass

---

## Security & access (P2)

- [x] Proxy recipes + change password
- [ ] Session / remember me / 2FA
- [ ] Viewer role + audit log

---

## Networking (P2)

- [x] Per-app nginx/Caddy + **Traefik labels**
- [ ] Cloudflare Tunnel recipe
- [ ] Custom domain map UI

---

## Data & storage (P2)

- [x] Media library path presets
- [ ] SMART / quota / move-data wizard

---

## Platform (P2–P3)

- [x] ARM64 + amd64 publish workflow
- [x] Podman note (Linux Docker-compatible socket; Podman may work with DOCKER_HOST)
- [x] Windows host / K8s out of scope

---

## Docs & community (P2)

- [x] docs/apps.md, CONTRIBUTING, issue templates, CHANGELOG
- [ ] Demo GIF / Discussions

---

## Nice-to-have (P3)

- [ ] Themes beyond accent / widgets / terminal / PWA / i18n / graphs

---

## Explicitly out of scope (for now)

- Full Kubernetes · marketplace billing · replacing Portainer entirely · Windows Docker host

---

## How we ship

1. Keep README short.
2. Detail lives here.
3. One-liner install; no tunnels required.
4. Every push explains what improved / fixed.
