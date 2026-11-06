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
  ports?: { host: string; container: string; protocol?: string }[]
  web_port?: string
  installed: boolean
  status?: string
  running: boolean
  external?: boolean
  url?: string
}

export type InstalledApp = {
  id: string
  name: string
  description: string
  category: string
  icon: string
  image: string
  container_id?: string
  container_name?: string
  status: string
  running: boolean
  external?: boolean
  url?: string
  web_port?: string
  installed_at?: string
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
  getSettings: () => req<{ public_url: string }>('/api/settings'),
  saveSettings: (body: { public_url: string }) =>
    req<{ public_url: string }>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  catalog: () => req<CatalogApp[]>('/api/catalog'),
  apps: () => req<InstalledApp[]>('/api/apps'),
  metrics: () => req<Metrics>('/api/metrics'),
  start: (id: string) => req(`/api/apps/${id}/start`, { method: 'POST' }),
  stop: (id: string) => req(`/api/apps/${id}/stop`, { method: 'POST' }),
  restart: (id: string) => req(`/api/apps/${id}/restart`, { method: 'POST' }),
  remove: (id: string) => req(`/api/apps/${id}`, { method: 'DELETE' }),
  installStream: async function* (id: string): AsyncGenerator<ProgressEvent> {
    const res = await fetch(`/api/apps/${id}/install`, {
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
