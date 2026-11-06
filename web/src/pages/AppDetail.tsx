import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  api,
  formatBytes,
  formatRelative,
  type InstalledApp,
  type InspectInfo,
  type StatsInfo,
  type UpdateCheck,
} from '../api'
import { AppIcon } from '../ui/AppIcon'
import { useToast } from '../ui/Toast'

type Tab = 'overview' | 'logs' | 'config' | 'connect'

export function AppDetail() {
  const { id = '' } = useParams()
  const toast = useToast()
  const [app, setApp] = useState<InstalledApp | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [inspect, setInspect] = useState<InspectInfo | null>(null)
  const [stats, setStats] = useState<StatsInfo | null>(null)
  const [logs, setLogs] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [update, setUpdate] = useState<UpdateCheck | null>(null)
  const [updateMsg, setUpdateMsg] = useState('')
  const [proxy, setProxy] = useState<{ nginx: string; caddy: string } | null>(null)

  async function refresh() {
    const found = await api.app(id)
    setApp(found)
  }

  useEffect(() => {
    refresh().catch((e) => setError(e.message))
  }, [id])

  useEffect(() => {
    if (!app?.installed && !app?.container_name) return
    if (tab === 'overview') {
      api.appInspect(id).then(setInspect).catch(() => setInspect(null))
      api.appStats(id).then(setStats).catch(() => setStats(null))
      api.appUpdateCheck(id, false).then(setUpdate).catch(() => setUpdate(null))
    }
    if (tab === 'logs') {
      api.appLogs(id, 300).then((r) => setLogs(r.logs)).catch((e) => setLogs(e.message))
    }
    if (tab === 'config' || tab === 'connect') {
      api.appInspect(id).then(setInspect).catch(() => setInspect(null))
    }
    if (tab === 'connect') {
      api.appProxy(id).then((p) => setProxy({ nginx: p.nginx, caddy: p.caddy })).catch(() => setProxy(null))
    }
  }, [id, tab, app?.container_name, app?.installed])

  async function toggleFavorite() {
    if (!app) return
    const cur = await api.favorites()
    const set = new Set(cur.ids)
    if (set.has(app.id)) set.delete(app.id)
    else set.add(app.id)
    await api.saveFavorites(Array.from(set))
    await refresh()
    toast.push(set.has(app.id) ? 'Pinned' : 'Unpinned', 'ok')
  }

  function downloadLogs() {
    const blob = new Blob([logs || ''], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${app?.id || 'app'}-logs.txt`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function act(fn: (id: string) => Promise<unknown>) {
    if (!app) return
    setBusy(true)
    setError('')
    try {
      await fn(app.id)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  async function checkUpdates() {
    setBusy(true)
    setError('')
    setUpdateMsg('Pulling latest image…')
    try {
      const check = await api.appUpdateCheck(id, true)
      setUpdate(check)
      setUpdateMsg(check.update_available ? 'Update available' : 'Already up to date')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update check failed')
      setUpdateMsg('')
    } finally {
      setBusy(false)
    }
  }

  async function applyUpdate() {
    if (!app || app.external) return
    if (!confirm(`Recreate ${app.name} with the latest image?`)) return
    setBusy(true)
    setError('')
    setUpdateMsg('Updating…')
    try {
      for await (const ev of api.updateStream(app.id)) {
        setUpdateMsg(ev.message || ev.status)
        if (ev.status === 'error') throw new Error(ev.message)
      }
      await refresh()
      setUpdate({ update_available: false, image: app.image, pulled: true })
      setUpdateMsg('Updated')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  if (!app && !error) {
    return <p className="text-[var(--color-fog)]">Loading…</p>
  }

  if (!app) {
    return (
      <div className="space-y-4">
        <p className="text-[var(--color-rose)]">{error || 'Not found'}</p>
        <Link to="/apps" className="btn btn-ghost">
          Back to apps
        </Link>
      </div>
    )
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'logs', label: 'Logs' },
    { id: 'config', label: 'Config' },
    { id: 'connect', label: 'Connect' },
  ]

  return (
    <div className="space-y-7">
      <Link to="/apps" className="text-sm text-[var(--color-fog)] hover:text-[var(--color-teal)]">
        ← Apps
      </Link>

      <section className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <AppIcon icon={app.icon} name={app.name} size="lg" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-700 tracking-tight">{app.name}</h1>
              <span className={`badge ${app.running ? 'badge-ok' : 'badge-muted'}`}>
                {app.running ? 'running' : app.status || 'stopped'}
              </span>
              {(inspect?.health || app.health) === 'healthy' && <span className="badge badge-ok">healthy</span>}
              {(inspect?.health || app.health) === 'unhealthy' && (
                <span className="badge badge-danger">unhealthy</span>
              )}
              {update?.update_available && <span className="badge badge-warn">update</span>}
              {app.external && <span className="badge badge-accent">on host</span>}
            </div>
            <p className="mt-2 max-w-xl text-[var(--color-fog)]">{app.description}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {app.url && (
            <a href={app.url} target="_blank" rel="noreferrer" className="btn btn-primary">
              Open
            </a>
          )}
          {app.running ? (
            <button disabled={busy} onClick={() => act(api.stop)} className="btn btn-ghost">
              Stop
            </button>
          ) : (
            <button disabled={busy} onClick={() => act(api.start)} className="btn btn-ghost">
              Start
            </button>
          )}
          <button disabled={busy} onClick={() => act(api.restart)} className="btn btn-ghost">
            Restart
          </button>
          <button disabled={busy} onClick={() => void toggleFavorite()} className="btn btn-ghost">
            {app.favorite ? 'Unpin' : 'Pin'}
          </button>
          <button disabled={busy} onClick={checkUpdates} className="btn btn-ghost">
            Check updates
          </button>
          {!app.external && update?.update_available && (
            <button disabled={busy} onClick={applyUpdate} className="btn btn-primary">
              Update
            </button>
          )}
        </div>
      </section>

      {error && <p className="text-sm text-[var(--color-rose)]">{error}</p>}

      <div className="flex gap-1 border-b border-[var(--color-line)]">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm transition ${
              tab === t.id
                ? 'border-b-2 border-[var(--color-teal)] font-600 text-[var(--color-snow)]'
                : 'text-[var(--color-fog)] hover:text-[var(--color-snow)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="surface grid gap-4 p-5 sm:grid-cols-2">
            <div>
              <div className="text-sm text-[var(--color-fog)]">Container</div>
              <div className="mt-1 truncate font-mono text-sm">{app.container_name || '—'}</div>
            </div>
            <div>
              <div className="text-sm text-[var(--color-fog)]">Image</div>
              <div className="mt-1 truncate font-mono text-sm">{inspect?.image || app.image || '—'}</div>
            </div>
            <div>
              <div className="text-sm text-[var(--color-fog)]">Started</div>
              <div className="mt-1 text-sm">{formatRelative(inspect?.started)}</div>
            </div>
            <div>
              <div className="text-sm text-[var(--color-fog)]">Category</div>
              <div className="mt-1 font-600 capitalize">{app.category || '—'}</div>
            </div>
          </div>
          <div className="surface p-5">
            <h2 className="text-lg font-700">Resources</h2>
            {stats ? (
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--color-fog)]">CPU</dt>
                  <dd className="font-600">{stats.cpu_percent.toFixed(1)}%</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--color-fog)]">Memory</dt>
                  <dd className="font-600">
                    {formatBytes(stats.mem_used)}
                    {stats.mem_limit ? ` / ${formatBytes(stats.mem_limit)}` : ''}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-3 text-sm text-[var(--color-fog)]">Stats unavailable (container may be stopped).</p>
            )}
            {updateMsg && <p className="mt-4 text-sm text-[var(--color-fog)]">{updateMsg}</p>}
          </div>
          {(app.stack?.length || 0) > 1 && (
            <div className="surface p-5 lg:col-span-2">
              <h2 className="text-lg font-700">Stack</h2>
              <p className="mt-1 text-sm text-[var(--color-fog)]">
                Compose project {app.compose_project || inspect?.compose_project}
              </p>
              <div className="mt-3 space-y-2 text-sm">
                {app.stack!.map((s) => (
                  <div
                    key={s.name}
                    className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-line)] pt-2 first:border-0 first:pt-0"
                  >
                    <span className="font-mono text-xs">
                      {s.service || s.name}
                      {s.service ? ` · ${s.name}` : ''}
                    </span>
                    <span className="flex gap-2">
                      {s.health && (
                        <span className={`badge ${s.health === 'healthy' ? 'badge-ok' : s.health === 'unhealthy' ? 'badge-danger' : 'badge-muted'}`}>
                          {s.health}
                        </span>
                      )}
                      <span className={`badge ${s.running ? 'badge-ok' : 'badge-muted'}`}>
                        {s.running ? 'running' : s.state}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="surface p-5 lg:col-span-2">
            <h2 className="text-lg font-700">Ports</h2>
            <div className="mt-3 space-y-2 text-sm">
              {(inspect?.ports || []).length === 0 && <p className="text-[var(--color-fog)]">No published ports.</p>}
              {(inspect?.ports || []).map((p, i) => (
                <div key={i} className="flex justify-between gap-4 border-t border-[var(--color-line)] pt-2 first:border-0 first:pt-0">
                  <span className="font-mono">
                    {p.host_port || '—'} → {p.container_port}/{p.protocol}
                  </span>
                  <span className="text-[var(--color-fog)]">{p.host_ip || '0.0.0.0'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'logs' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-ghost !py-1.5"
              disabled={busy}
              onClick={() =>
                api.appLogs(id, 300).then((r) => setLogs(r.logs)).catch((e) => setLogs(e.message))
              }
            >
              Refresh
            </button>
            <button className="btn btn-ghost !py-1.5" onClick={downloadLogs} disabled={!logs}>
              Download .txt
            </button>
          </div>
          <pre className="surface max-h-[28rem] overflow-auto p-4 font-mono text-xs leading-relaxed text-[var(--color-fog)] whitespace-pre-wrap">
            {logs || 'No logs.'}
          </pre>
        </div>
      )}

      {tab === 'config' && (
        <div className="surface p-5">
          <h2 className="text-lg font-700">Environment</h2>
          <p className="mt-1 text-sm text-[var(--color-fog)]">Secrets are masked.</p>
          <dl className="mt-4 space-y-2 text-sm">
            {Object.entries(inspect?.env || {}).length === 0 && (
              <p className="text-[var(--color-fog)]">No environment variables.</p>
            )}
            {Object.entries(inspect?.env || {}).map(([k, v]) => (
              <div key={k} className="grid gap-1 border-t border-[var(--color-line)] pt-2 sm:grid-cols-[12rem_1fr]">
                <dt className="font-mono text-[var(--color-fog)]">{k}</dt>
                <dd className="break-all font-mono">{v}</dd>
              </div>
            ))}
          </dl>
          <h2 className="mt-8 text-lg font-700">Mounts</h2>
          <div className="mt-3 space-y-2 text-sm">
            {(inspect?.mounts || []).length === 0 && <p className="text-[var(--color-fog)]">No mounts.</p>}
            {(inspect?.mounts || []).map((m, i) => (
              <div key={i} className="border-t border-[var(--color-line)] pt-2 font-mono text-xs first:border-0 first:pt-0">
                {m.source} → {m.destination} {m.rw ? '' : '(ro)'}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'connect' && (
        <div className="surface space-y-4 p-5">
          <div>
            <div className="text-sm text-[var(--color-fog)]">Open URL</div>
            <div className="mt-1">
              {app.url ? (
                <a href={app.url} className="text-[var(--color-teal)] hover:underline" target="_blank" rel="noreferrer">
                  {app.url}
                </a>
              ) : (
                '—'
              )}
            </div>
          </div>
          <div>
            <div className="text-sm text-[var(--color-fog)]">Web port</div>
            <div className="mt-1 font-600">{app.web_port || '—'}</div>
          </div>
          <p className="text-sm text-[var(--color-fog)]">
            Open uses Settings → Public URL + this app’s port{app.default_path ? ` + ${app.default_path}` : ''}.
          </p>
          {proxy && (
            <div className="space-y-3 pt-2">
              <h3 className="text-sm font-600">Per-app nginx</h3>
              <pre className="overflow-auto rounded-xl bg-[var(--bg)] p-3 font-mono text-xs text-[var(--color-fog)] whitespace-pre-wrap">
                {proxy.nginx}
              </pre>
              <h3 className="text-sm font-600">Caddy</h3>
              <pre className="overflow-auto rounded-xl bg-[var(--bg)] p-3 font-mono text-xs text-[var(--color-fog)] whitespace-pre-wrap">
                {proxy.caddy}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
