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

function Metric({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="surface px-4 py-4">
      <div className="text-sm text-[var(--color-fog)]">{label}</div>
      <div className="mt-1.5 text-2xl font-700 tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-[var(--color-fog)]">{hint}</div>}
    </div>
  )
}

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

export function Overview() {
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [apps, setApps] = useState<InstalledApp[]>([])
  const [docker, setDocker] = useState(false)

  useEffect(() => {
    let alive = true
    api.metrics().then((m) => alive && setMetrics(m)).catch(() => {})
    api.apps().then((a) => alive && setApps(a)).catch(() => {})
    api.health().then((h) => alive && setDocker(h.docker)).catch(() => {})

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
  const attention = useMemo(
    () =>
      apps.filter(
        (a) => !a.running || a.health === 'unhealthy' || a.update_available,
      ),
    [apps],
  )
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
    <div className="space-y-8">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-700 tracking-tight">Overview</h1>
          <p className="mt-1.5 text-[var(--color-fog)]">Live metrics, drives, and services on this host.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/apps" className="btn btn-ghost">
            Apps
          </Link>
          <Link to="/catalog" className="btn btn-primary">
            Catalog
          </Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="CPU" value={metrics ? `${metrics.cpu_percent.toFixed(1)}%` : '—'} hint={metrics?.hostname} />
        <div className="surface px-4 py-4">
          <div className="text-sm text-[var(--color-fog)]">Memory</div>
          <div className="mt-1.5 text-2xl font-700 tracking-tight">
            {metrics ? `${metrics.mem_percent.toFixed(0)}%` : '—'}
          </div>
          {metrics && (
            <>
              <div className="mt-1 text-xs text-[var(--color-fog)]">
                {formatBytes(metrics.mem_used)} / {formatBytes(metrics.mem_total)}
              </div>
              <Bar pct={metrics.mem_percent} />
            </>
          )}
        </div>
        <div className="surface px-4 py-4">
          <div className="text-sm text-[var(--color-fog)]">Drives</div>
          <div className="mt-1.5 text-2xl font-700 tracking-tight">{disks.length || '—'}</div>
          <div className="mt-1 text-xs text-[var(--color-fog)]">
            {disks.length ? `${disks.filter((d) => d.health === 'ok').length} healthy` : 'scanning…'}
          </div>
        </div>
        <Metric
          label="Network"
          value={metrics ? `↓ ${formatBytes(metrics.net_recv_ps)}/s` : '—'}
          hint={metrics ? `↑ ${formatBytes(metrics.net_sent_ps)}/s` : undefined}
        />
      </section>

      <section className="surface p-5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-700">Storage</h2>
          <span className="text-sm text-[var(--color-fog)]">All mounted drives</span>
        </div>
        <div className="mt-4 space-y-4">
          {disks.length === 0 && (
            <p className="text-sm text-[var(--color-fog)]">No volumes reported yet.</p>
          )}
          {disks.map((d) => (
            <div key={`${d.device}-${d.mountpoint}`} className="border-t border-[var(--color-line)] pt-4 first:border-0 first:pt-0">
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
      </section>

      {attention.length > 0 && (
        <section className="surface border-[var(--color-amber)]/30 p-5">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-700">Needs attention</h2>
            <span className="text-sm text-[var(--color-amber)]">{attention.length}</span>
          </div>
          <div className="mt-3 space-y-2">
            {attention.map((app) => (
              <Link
                key={app.id}
                to={`/apps/${app.id}`}
                className="flex items-center justify-between gap-3 border-t border-[var(--color-line)] py-2.5 first:border-0 first:pt-0 hover:opacity-90"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <AppIcon icon={app.icon} name={app.name} size="sm" />
                  <span className="font-500">{app.name}</span>
                </div>
                <span className="text-sm text-[var(--color-fog)]">
                  {app.health === 'unhealthy'
                    ? 'unhealthy'
                    : app.update_available
                      ? 'update available'
                      : 'stopped'}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="surface p-5">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-700">Services</h2>
            <span className="text-sm text-[var(--color-fog)]">
              {running}/{apps.length} running
            </span>
          </div>
          <div className="mt-4">
            {apps.length === 0 && (
              <p className="py-6 text-sm text-[var(--color-fog)]">
                Nothing detected yet. Slipway will pick up matching Docker apps already on this host.
              </p>
            )}
            {apps.map((app) => (
              <Link
                key={app.id}
                to={`/apps/${app.id}`}
                className="flex items-center justify-between gap-3 border-t border-[var(--color-line)] py-3 first:border-0 first:pt-0 hover:opacity-90"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <AppIcon icon={app.icon} name={app.name} size="sm" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-500">{app.name}</div>
                      {app.external && <span className="badge badge-accent">on host</span>}
                      {app.health === 'unhealthy' && <span className="badge badge-danger">unhealthy</span>}
                    </div>
                    <div className="truncate text-xs text-[var(--color-fog)]">
                      {app.container_name || app.status}
                    </div>
                  </div>
                </div>
                <span className={`badge ${app.running ? 'badge-ok' : 'badge-muted'}`}>
                  {app.running ? 'running' : 'stopped'}
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="surface p-5">
          <h2 className="text-lg font-700">Host</h2>
          <dl className="mt-4 space-y-3 text-sm">
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
              <dd className="truncate">{metrics?.platform || '—'}</dd>
            </div>
          </dl>
          <Link to="/apps" className="btn btn-ghost mt-6 w-full">
            Manage apps
          </Link>
        </div>
      </section>
    </div>
  )
}
