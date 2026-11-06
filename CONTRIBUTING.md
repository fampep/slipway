# Contributing

1. Fork and branch from `main`.
2. Keep the public install path simple (`curl | bash`).
3. Prefer small PRs; update `ROADMAP.md` checkboxes when you ship an item.
4. Test on Linux + Docker when touching install, docker client, or catalog.

## Dev

```bash
# API
go run ./cmd/appbox

# UI
cd web && npm install && npm run dev
```

Catalog YAML format: [docs/apps.md](docs/apps.md).
