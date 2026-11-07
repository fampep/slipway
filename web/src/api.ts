export type Health = {
  ok: boolean
  docker: boolean
  setup_needed: boolean
}

export type User = { id: number; username: string }

export type CatalogApp = {
  id: string
  name: string
  description: string
  category: string
  image: string
  icon: string
  website?: string
  docs?: string
  custom?: boolean
  source?: string
  tags?: string[]
  ports?: { host: string; container: string; protocol?: string }[]
  web_port?: string
  default_path?: string
  env?: Record<string, string>
  installed: boolean
  status?: string
  running: boolean
  external?: boolean
  url?: string
  favorite?: boolean
}

export type StackMember = {
  name: string
  service?: string
  state: string
  running: boolean
  health?: string
}

export type InstalledApp = {
  id: string
  name: string
  description: string
  category: string
  icon: string
  image: string
  website?: string
  custom?: boolean
  source?: string
  container_id?: string
  container_name?: string
  status: string
  running: boolean
  external?: boolean
  health?: string
  update_available?: boolean
  compose_project?: string
  compose_service?: string
  stack?: StackMember[]
  installed?: boolean
  url?: string
  web_port?: string
  default_path?: string
  tags?: string[]
  favorite?: boolean
  installed_at?: string
}

export type InspectInfo = {
  id: string
  name: string
  image: string
  image_id?: string
  status: string
  health?: string
  running: boolean
  started?: string
  ports: { host_ip?: string; host_port: string; container_port: string; protocol: string }[]
  mounts: { source: string; destination: string; mode?: string; rw: boolean }[]
  env: Record<string, string>
  compose_project?: string
  compose_service?: string
}

export type UpdateCheck = {
  update_available: boolean
  current_image_id?: string
  latest_image_id?: string
  image: string
  pulled: boolean
}

export type StatsInfo = {
  cpu_percent: number
  mem_used: number
  mem_limit: number
  mem_percent: number
}

export type ImportPreview = {
  app: CatalogApp & { webui_port?: string }
  apps?: (CatalogApp & { webui_port?: string })[]
  warnings?: string[]
  source: string
}

export type DiskVolume = {
  device: string
  mountpoint: string
  fstype: string
  used: number
  total: number
  free: number
  percent: number
  health: 'ok' | 'warn' | 'critical' | 'unknown' | string
}

export type Metrics = {
  timestamp: string
  hostname: string
  platform: string
  uptime_sec: number
  cpu_percent: number
  mem_used: number
  mem_total: number
  mem_percent: number
  disk_used: number
  disk_total: number
  disk_percent: number
  disks?: DiskVolume[]
  net_sent_ps: number
  net_recv_ps: number
  docker_ok?: boolean
}

export type LiveMessage = {
  type: 'live'
  metrics: Metrics
  apps: InstalledApp[]
  docker: boolean
}

export type ProgressEvent = {
  status: string
  stage?: string
  message: string
  percent?: number
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  })
  if (!res.ok) {
    let msg = res.statusText
    try {
      const body = await res.json()
      if (body?.error) msg = body.error
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }
  return res.json() as Promise<T>
}

export const api = {
  health: () => req<Health>('/api/health'),
  setupStatus: () =>
    req<{
      setup_needed: boolean
      needsSetup?: boolean
      docker?: boolean
      catalog_count?: number
      public_url?: string
      suggested_url?: string
    }>('/api/setup'),
  setup: (
    username: string,
    password: string,
    extra?: { confirm_password?: string; public_url?: string },
  ) =>
    req<{ user: User }>('/api/setup', {
      method: 'POST',
      body: JSON.stringify({ username, password, ...extra }),
    }),
  login: (username: string, password: string) =>
    req<{ user: User }>('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () => req<{ ok: boolean }>('/api/logout', { method: 'POST' }),
  me: () => req<User>('/api/me'),
  getSettings: () =>
    req<{
      public_url: string
      webhook_url?: string
      media_path?: string
      downloads_path?: string
      disk_warn_percent?: string
      accent?: string
      auto_update?: boolean
      suggested_url?: string
      version?: string
    }>('/api/settings'),
  saveSettings: (body: {
    public_url: string
    webhook_url?: string
    media_path?: string
    downloads_path?: string
    disk_warn_percent?: string
    accent?: string
    auto_update?: boolean
  }) =>
    req<{ public_url: string; webhook_url?: string; version?: string }>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  changePassword: (current_password: string, new_password: string) =>
    req<{ ok: boolean }>('/api/password', {
      method: 'POST',
      body: JSON.stringify({ current_password, new_password }),
    }),
  version: () => req<{ version: string; name: string }>('/api/version'),
  favorites: () => req<{ ids: string[] }>('/api/favorites'),
  saveFavorites: (ids: string[]) =>
    req<{ ids: string[] }>('/api/favorites', { method: 'PUT', body: JSON.stringify({ ids }) }),
  onboarding: () => req<{ done: boolean }>('/api/onboarding'),
  finishOnboarding: () => req<{ done: boolean }>('/api/onboarding', { method: 'POST' }),
  catalog: () => req<CatalogApp[]>('/api/catalog'),
  importPreview: (url: string, compose?: string) =>
    req<ImportPreview>('/api/catalog/import', {
      method: 'POST',
      body: JSON.stringify(compose ? { compose } : { url }),
    }),
  importSave: (app: Record<string, unknown>) =>
    req<CatalogApp>('/api/catalog/custom', {
      method: 'POST',
      body: JSON.stringify(app),
    }),
  importSaveMany: (apps: Record<string, unknown>[]) =>
    req<{ apps: CatalogApp[]; count: number }>('/api/catalog/custom/batch', {
      method: 'POST',
      body: JSON.stringify({ apps }),
    }),
  deleteCustom: (id: string) => req<{ ok: boolean }>(`/api/catalog/custom/${id}`, { method: 'DELETE' }),
  portCheck: (id: string) =>
    req<{ ok: boolean; conflicts: { port: string; used_by: string }[] }>(`/api/catalog/${id}/ports`),
  stackRecommend: () =>
    req<{
      apps: {
        id: string
        name: string
        description: string
        installed: boolean
        running: boolean
        in_catalog: boolean
      }[]
      media_path?: string
      downloads_path?: string
    }>('/api/catalog/stack'),
  changelog: () =>
    req<{ entries: { version: string; date: string; summary: string }[]; seen: string; current: string }>(
      '/api/changelog',
    ),
  changelogSeen: () => req<{ ok: boolean }>('/api/changelog/seen', { method: 'POST' }),
  updateAllStream: async function* (): AsyncGenerator<ProgressEvent & { id?: string }> {
    const res = await fetch('/api/apps/update-all', { method: 'POST', credentials: 'include' })
    if (!res.ok || !res.body) throw new Error(res.statusText)
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() || ''
      for (const line of lines) {
        if (!line.trim()) continue
        yield JSON.parse(line) as ProgressEvent & { id?: string }
      }
    }
    if (buf.trim()) yield JSON.parse(buf) as ProgressEvent & { id?: string }
  },
  apps: () => req<InstalledApp[]>('/api/apps'),
  app: (id: string) => req<InstalledApp>(`/api/apps/${id}`),
  appLogs: (id: string, tail = 200) =>
    req<{ logs: string; container: string }>(`/api/apps/${id}/logs?tail=${tail}`),
  appInspect: (id: string) => req<InspectInfo>(`/api/apps/${id}/inspect`),
  appStats: (id: string) => req<StatsInfo>(`/api/apps/${id}/stats`),
  appUpdateCheck: (id: string, pull = true) =>
    req<UpdateCheck>(`/api/apps/${id}/update?pull=${pull ? '1' : '0'}`),
  checkAllUpdates: (pull = false) =>
    req<{ results: { id: string; name: string; update_available: boolean; error?: string }[] }>(
      `/api/apps/updates?pull=${pull ? '1' : '0'}`,
    ),
  appProxy: (id: string) =>
    req<{ nginx: string; caddy: string; traefik?: string; host: string; port: string }>(
      `/api/apps/${id}/proxy`,
    ),
  appLogsStreamURL: (id: string, tail = 100) => `/api/apps/${id}/logs/stream?tail=${tail}`,
  bulkApps: (action: 'start' | 'stop' | 'restart', ids: string[]) =>
    req<{ results: { id: string; ok: boolean; error?: string; status?: string; running?: boolean }[] }>(
      '/api/apps/bulk',
      { method: 'POST', body: JSON.stringify({ action, ids }) },
    ),
  metrics: () => req<Metrics>('/api/metrics'),
  proxySnippet: () => req<{ nginx: string; caddy: string; host: string }>('/api/settings/proxy'),
  exportConfig: () => req<{ public_url: string; custom_apps: CatalogApp[]; version: number }>('/api/export'),
  start: (id: string) => req(`/api/apps/${id}/start`, { method: 'POST' }),
  stop: (id: string) => req(`/api/apps/${id}/stop`, { method: 'POST' }),
  restart: (id: string) => req(`/api/apps/${id}/restart`, { method: 'POST' }),
  remove: (id: string) => req(`/api/apps/${id}`, { method: 'DELETE' }),
  updateStream: async function* (id: string): AsyncGenerator<ProgressEvent> {
    const res = await fetch(`/api/apps/${id}/update`, {
      method: 'POST',
      credentials: 'include',
    })
    if (!res.ok || !res.body) {
      let msg = res.statusText
      try {
        const body = await res.json()
        if (body?.error) msg = body.error
      } catch {
        /* ignore */
      }
      throw new Error(msg)
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() || ''
      for (const line of lines) {
        if (!line.trim()) continue
        yield JSON.parse(line) as ProgressEvent
      }
    }
    if (buf.trim()) yield JSON.parse(buf) as ProgressEvent
  },
  installStream: async function* (
    id: string,
    opts?: { env?: Record<string, string> },
  ): AsyncGenerator<ProgressEvent> {
    const res = await fetch(`/api/apps/${id}/install`, {
      method: 'POST',
      credentials: 'include',
      headers: opts?.env ? { 'Content-Type': 'application/json' } : undefined,
      body: opts?.env ? JSON.stringify({ env: opts.env }) : undefined,
    })
    if (!res.ok || !res.body) {
      let msg = res.statusText
      try {
        const body = await res.json()
        if (body?.error) msg = body.error
      } catch {
        /* ignore */
      }
      throw new Error(msg)
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() || ''
      for (const line of lines) {
        if (!line.trim()) continue
        yield JSON.parse(line) as ProgressEvent
      }
    }
    if (buf.trim()) yield JSON.parse(buf) as ProgressEvent
  },
}

export function wsURL(): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}/api/ws`
}

export function formatBytes(n: number): string {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function formatUptime(sec: number): string {
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function formatRelative(iso?: string): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '—'
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000))
  if (sec < 60) return 'just now'
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
  return `${Math.floor(sec / 86400)}d ago`
}
