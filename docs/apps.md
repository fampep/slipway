# Writing a Slipway catalog app

Drop a YAML file in `catalog/` (or import via **Catalog → Add app**).

```yaml
id: myapp                 # required, lowercase
name: My App
description: Short blurb
category: media           # media | download | request | tools | storage | custom
image: org/image:latest
icon: https://raw.githubusercontent.com/walkxcode/dashboard-icons/main/svg/myapp.svg
tags: [media]
ports:
  - host: "8080"
    container: "80"
volumes:
  - host: "./config"
    container: "/config"
env:
  TZ: UTC
webui_port: "8080"
default_path: "/"
health_url: "http://127.0.0.1:8080/health"
restart: unless-stopped
```

Relative volume hosts resolve under Slipway’s data dir (`apps/<id>/…`).
