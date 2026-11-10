import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  api,
  formatBytes,
  formatUptime,
  wsURL,
  type DiskVolume,
  type InstalledApp,
  type LiveMessage,
  type Metrics,
} from '../api'
import { AppIcon } from '../ui/AppIcon'
import { PageSkeleton } from '../ui/Skeleton'
import { useToast } from '../ui/Toast'

function Bar({ pct, warn = false }: { pct: number; warn?: boolean }) {
  return (
    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--color-panel-2)]">
      <motion.div
        className={`h-full rounded-full ${warn ? 'bg-[var(--color-amber)]' : 'bg-[var(--color-teal)]'}`}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        transition={{ type: 'spring', stiffness: 120, damping: 22 }}
      />
    </div>
  )
}

function healthTone(h: string) {
  if (h === 'critical') return 'text-[var(--color-rose)]'
  if (h === 'warn') return 'text-[var(--color-amber)]'
  if (h === 'ok') return 'text-[var(--ok)]'
  return 'text-[var(--color-fog)]'
}

function attentionLabel(app: InstalledApp) {
  if (app.health === 'unhealthy') return 'unhealthy'
  if (app.update_available) return 'update available'
  return 'stopped'
}

export function Overview() {
  const toast = useToast()
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [apps, setApps] = useState<InstalledApp[]>([])
  const [docker, setDocker] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all([
      api.metrics().then((m) => alive && setMetrics(m)).catch(() => {}),
      api.apps().then((a) => alive && setApps(a)).catch(() => {}),
      api.health().then((h) => alive && setDocker(h.docker)).catch(() => {}),
      api.onboarding().then((o) => alive && setShowOnboarding(!o.done)).catch(() => {}),
    ]).finally(() => alive && setLoading(false))

    const ws = new WebSocket(wsURL())
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as LiveMessage
        if (msg.type !== 'live') return
        setMetrics(msg.metrics)
        setApps(msg.apps || [])
        setDocker(msg.docker)
      } catch {
        /* ignore */
      }
    }
    return () => {
      alive = false
      ws.close()
    }
  }, [])

  const running = useMemo(() => apps.filter((a) => a.running).length, [apps])
  const pinned = useMemo(() => apps.filter((a) => a.favorite), [apps])
  const attention = useMemo(
    () => apps.filter((a) => !a.running || a.health === 'unhealthy' || a.update_available),
    [apps],
  )
  const listed = useMemo(() => {
    if (!pinned.length) return apps
    const ids = new Set(pinned.map((a) => a.id))
    return [...pinned, ...apps.filter((a) => !ids.has(a.id))]
  }, [apps, pinned])

  async function quickAct(id: string, action: 'start' | 'stop' | 'restart') {
    setBusyId(id)
    try {
      if (action === 'start') await api.start(id)
      else if (action === 'stop') await api.stop(id)
      else await api.restart(id)
      setApps(await api.apps())
      toast.push(action === 'stop' ? 'Stopped' : action === 'start' ? 'Started' : 'Restarted', 'ok')
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Action failed', 'error')
    } finally {
      setBusyId(null)
    }
  }

  if (loading && !metrics) {
    return <PageSkeleton />
  }

  const disks: DiskVolume[] = metrics?.disks?.length
    ? metrics.disks
    : metrics
      ? [
          {
            device: 'root',
            mountpoint: '/',
            fstype: '',
            used: metrics.disk_used,
            total: metrics.disk_total,
            free: Math.max(0, metrics.disk_total - metrics.disk_used),
            percent: metrics.disk_percent,
            health: metrics.disk_percent > 95 ? 'critical' : metrics.disk_percent > 85 ? 'warn' : 'ok',
          },
        ]
      : []

  return (
    <div className="space-y-10">
      <section className="overview-hero relative overflow-hidden rounded-2xl border border-[var(--color-line)] px-6 py-8 sm:px-8 sm:py-10">
        <div className="overview-hero-glow" aria-hidden />
        <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl">
            <div className="flex items-center gap-2 text-sm text-[var(--color-fog)]">
              <span
                className={`inline-block h-2 w-2 rounded-full ${docker ? 'bg-[var(--ok)] live-pulse' : 'bg-[var(--color-rose)]'}`}
              />
              {docker ? 'Docker connected' : 'Docker offline'}
              {metrics?.hostname ? ` · ${metrics.hostname}` : ''}
            </div>
            <h1 className="font-display mt-3 text-4xl font-700 tracking-tight sm:text-5xl">
              Your stack
            </h1>
            <p className="mt-3 text-[var(--color-fog)]">
              {running}/{apps.length || 0} services running
              {metrics ? ` · up ${formatUptime(metrics.uptime_sec)}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!apps.some((a) => a.running) || busyId === '__restart_all'}
              onClick={() => {
                void (async () => {
                  setBusyId('__restart_all')
                  try {
                    for (const a of apps.filter((x) => x.running)) {
                      await api.restart(a.id)
                    }
                    setApps(await api.apps())
                    toast.push('Restarted running services', 'ok')
                  } catch (e) {
                    toast.push(e instanceof Error ? e.message : 'Restart failed', 'error')
                  } finally {
                    setBusyId(null)
                  }
                })()
              }}
            >
              Restart running
            </button>
            <Link to="/apps" className="btn btn-ghost">
              Manage apps
            </Link>
            <Link to="/catalog" className="btn btn-primary">
              Browse catalog
            </Link>
          </div>
        </div>

        <div className="relative mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-[rgba(8,12,18,0.45)] px-4 py-3.5">
            <div className="text-xs text-[var(--color-fog)]">CPU</div>
            <div className="mt-1 text-2xl font-700 tracking-tight">
              {metrics ? `${metrics.cpu_percent.toFixed(1)}%` : '—'}
            </div>
          </div>
          <div className="rounded-xl bg-[rgba(8,12,18,0.45)] px-4 py-3.5">
            <div className="text-xs text-[var(--color-fog)]">Memory</div>
            <div className="mt-1 text-2xl font-700 tracking-tight">
              {metrics ? `${metrics.mem_percent.toFixed(0)}%` : '—'}
            </div>
            {metrics && (
              <div className="mt-0.5 text-xs text-[var(--color-fog)]">
                {formatBytes(metrics.mem_used)} / {formatBytes(metrics.mem_total)}
              </div>
            )}
          </div>
          <div className="rounded-xl bg-[rgba(8,12,18,0.45)] px-4 py-3.5">
            <div className="text-xs text-[var(--color-fog)]">Drives</div>
            <div className="mt-1 text-2xl font-700 tracking-tight">{disks.length || '—'}</div>
            <div className="mt-0.5 text-xs text-[var(--color-fog)]">
              {disks.length ? `${disks.filter((d) => d.health === 'ok').length} healthy` : 'scanning…'}
            </div>
          </div>
          <div className="rounded-xl bg-[rgba(8,12,18,0.45)] px-4 py-3.5">
            <div className="text-xs text-[var(--color-fog)]">Network</div>
            <div className="mt-1 text-xl font-700 tracking-tight">
              {metrics ? `↓ ${formatBytes(metrics.net_recv_ps)}/s` : '—'}
            </div>
            {metrics && (
              <div className="mt-0.5 text-xs text-[var(--color-fog)]">
                ↑ {formatBytes(metrics.net_sent_ps)}/s
              </div>
            )}
          </div>
        </div>
      </section>

      {showOnboarding && (
        <section className="surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-700">Getting started</h2>
              <p className="mt-1 text-sm text-[var(--color-fog)]">A short checklist for a fresh panel.</p>
            </div>
            <button
              className="btn btn-ghost !py-1.5"
              onClick={() => {
                void api.finishOnboarding()
                setShowOnboarding(false)
              }}
            >
              Dismiss
            </button>
          </div>
          <ol className="mt-4 space-y-2 text-sm">
            <li className="flex justify-between gap-3 border-t border-[var(--color-line)] pt-2">
              <span>Set your public URL</span>
              <Link to="/settings" className="text-[var(--color-teal)]">Settings</Link>
            </li>
            <li className="flex justify-between gap-3 border-t border-[var(--color-line)] pt-2">
              <span>Install or adopt an app</span>
              <Link to="/catalog" className="text-[var(--color-teal)]">Catalog</Link>
            </li>
            <li className="flex justify-between gap-3 border-t border-[var(--color-line)] pt-2">
              <span>Open logs / stats on an app page</span>
              <Link to="/apps" className="text-[var(--color-teal)]">Apps</Link>
            </li>
          </ol>
        </section>
      )}

      {metrics && (metrics.cpu_percent > 90 || metrics.mem_percent > 90 || disks.some((d) => d.percent > 90)) && (
        <section className="surface border-[var(--color-rose)]/40 px-5 py-4" role="status">
          <h2 className="font-700 text-[var(--color-rose)]">Resource pressure</h2>
          <ul className="mt-2 space-y-1 text-sm text-[var(--color-fog)]">
            {metrics.cpu_percent > 90 && <li>CPU at {metrics.cpu_percent.toFixed(0)}%</li>}
            {metrics.mem_percent > 90 && <li>Memory at {metrics.mem_percent.toFixed(0)}%</li>}
            {disks
              .filter((d) => d.percent > 90)
              .map((d) => (
                <li key={`${d.device}-${d.mountpoint}`}>
                  Disk {d.mountpoint || d.device} at {d.percent.toFixed(0)}%
                </li>
              ))}
          </ul>
        </section>
      )}

      {attention.length > 0 && (
        <section className="surface border-[var(--color-amber)]/35 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-700">Needs attention</h2>
            <span className="badge badge-warn">{attention.length}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {attention.map((app) => (
              <Link
                key={app.id}
                to={`/apps/${app.id}`}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-[rgba(8,12,18,0.4)] px-3 py-1.5 text-sm hover:border-[var(--color-teal)]/40"
              >
                <AppIcon icon={app.icon} name={app.name} size="sm" />
                <span className="font-500">{app.name}</span>
                <span className="text-[var(--color-fog)]">{attentionLabel(app)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-700">Services</h2>
            <p className="mt-1 text-sm text-[var(--color-fog)]">Open any app for logs, stats, and updates.</p>
          </div>
          <Link to="/apps" className="text-sm text-[var(--color-teal)] hover:underline">
            View all
          </Link>
        </div>

        {apps.length === 0 ? (
          <div className="surface border-dashed px-6 py-14 text-center">
            <p className="text-[var(--color-fog)]">
              Nothing detected yet. Slipway will pick up matching Docker apps already on this host.
            </p>
            <Link to="/catalog" className="btn btn-primary mt-5">
              Install from catalog
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {listed.map((app, i) => (
              <motion.div
                key={app.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.04, 0.24), duration: 0.3 }}
              >
                <div className="surface group flex h-full flex-col gap-3 p-4 transition hover:border-[var(--color-teal)]/35">
                  <Link to={`/apps/${app.id}`} className="flex min-w-0 items-start gap-3">
                    <AppIcon icon={app.icon} name={app.name} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-600 group-hover:text-[var(--color-teal)]">{app.name}</div>
                        {app.favorite && <span className="badge badge-accent">pinned</span>}
                        <span className={`badge ${app.running ? 'badge-ok' : 'badge-muted'}`}>
                          {app.running ? 'running' : 'stopped'}
                        </span>
                      </div>
                      <div className="mt-1 truncate text-xs text-[var(--color-fog)]">
                        {app.container_name || app.status}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {app.external && <span className="badge badge-accent">on host</span>}
                        {app.health === 'unhealthy' && <span className="badge badge-danger">unhealthy</span>}
                        {app.health === 'healthy' && <span className="badge badge-ok">healthy</span>}
                      </div>
                    </div>
                  </Link>
                  <div className="flex flex-wrap gap-1.5 border-t border-[var(--color-line)] pt-3">
                    {app.url && (
                      <a href={app.url} target="_blank" rel="noreferrer" className="btn btn-ghost !py-1 !text-xs">
                        Open
                      </a>
                    )}
                    {app.running ? (
                      <button
                        disabled={busyId === app.id}
                        className="btn btn-ghost !py-1 !text-xs"
                        onClick={() => void quickAct(app.id, 'stop')}
                      >
                        Stop
                      </button>
                    ) : (
                      <button
                        disabled={busyId === app.id}
                        className="btn btn-ghost !py-1 !text-xs"
                        onClick={() => void quickAct(app.id, 'start')}
                      >
                        Start
                      </button>
                    )}
                    <button
                      disabled={busyId === app.id}
                      className="btn btn-ghost !py-1 !text-xs"
                      onClick={() => void quickAct(app.id, 'restart')}
                    >
                      Restart
                    </button>
                    <Link to={`/apps/${app.id}?tab=logs`} className="btn btn-ghost !py-1 !text-xs">
                      Logs
                    </Link>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
        <div className="surface p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-700">Storage</h2>
            <span className="text-sm text-[var(--color-fog)]">All mounted drives</span>
          </div>
          <div className="mt-5 space-y-5">
            {disks.length === 0 && (
              <p className="text-sm text-[var(--color-fog)]">No volumes reported yet.</p>
            )}
            {disks.map((d) => (
              <div key={`${d.device}-${d.mountpoint}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-600 truncate">{d.mountpoint || d.device}</div>
                    <div className="truncate text-xs text-[var(--color-fog)]">
                      {[d.device, d.fstype].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className={healthTone(d.health)}>{d.health}</span>
                    <span className="text-[var(--color-fog)]">
                      {formatBytes(d.used)} / {formatBytes(d.total)}
                    </span>
                    <span className="font-600">{d.percent.toFixed(0)}%</span>
                  </div>
                </div>
                <Bar pct={d.percent} warn={d.percent > 85} />
              </div>
            ))}
          </div>
        </div>

        <div className="surface p-5 sm:p-6">
          <h2 className="text-lg font-700">Host</h2>
          <dl className="mt-5 space-y-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--color-fog)]">Docker</dt>
              <dd className={docker ? 'text-[var(--ok)]' : 'text-[var(--color-rose)]'}>
                {docker ? 'connected' : 'offline'}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--color-fog)]">Uptime</dt>
              <dd>{metrics ? formatUptime(metrics.uptime_sec) : '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--color-fog)]">Platform</dt>
              <dd className="truncate text-right">{metrics?.platform || '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--color-fog)]">Memory</dt>
              <dd>{metrics ? `${metrics.mem_percent.toFixed(0)}%` : '—'}</dd>
            </div>
          </dl>
        </div>
      </section>
    </div>
  )
}
