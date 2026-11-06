import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  api,
  formatBytes,
  formatUptime,
  wsURL,
  type InstalledApp,
  type LiveMessage,
  type Metrics,
} from '../api'

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
    <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)]/60 px-4 py-4">
      <div className="text-xs uppercase tracking-wider text-[var(--color-fog)]">{label}</div>
      <div className="mt-2 font-display text-2xl font-700 text-[var(--color-snow)]">{value}</div>
      {hint && <div className="mt-1 text-xs text-[var(--color-fog)]">{hint}</div>}
    </div>
  )
}

function Bar({ pct, tone = 'teal' }: { pct: number; tone?: 'teal' | 'amber' }) {
  const color = tone === 'amber' ? 'bg-[var(--color-amber)]' : 'bg-[var(--color-teal)]'
  return (
    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--color-panel-2)]">
      <motion.div
        className={`h-full ${color}`}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        transition={{ type: 'spring', stiffness: 120, damping: 20 }}
      />
    </div>
  )
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

  return (
    <div className="space-y-10">
      <section>
        <p className="text-sm uppercase tracking-[0.18em] text-[var(--color-teal)]">Overview</p>
        <h1 className="mt-2 font-display text-4xl font-800 tracking-tight">Your stack at a glance</h1>
        <p className="mt-2 max-w-xl text-[var(--color-fog)]">
          Live host metrics and service health from the dedi Docker engine.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="CPU"
          value={metrics ? `${metrics.cpu_percent.toFixed(1)}%` : '—'}
          hint={metrics?.hostname}
        />
        <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)]/60 px-4 py-4">
          <div className="text-xs uppercase tracking-wider text-[var(--color-fog)]">Memory</div>
          <div className="mt-2 font-display text-2xl font-700">
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
        <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)]/60 px-4 py-4">
          <div className="text-xs uppercase tracking-wider text-[var(--color-fog)]">Disk</div>
          <div className="mt-2 font-display text-2xl font-700">
            {metrics ? `${metrics.disk_percent.toFixed(0)}%` : '—'}
          </div>
          {metrics && (
            <>
              <div className="mt-1 text-xs text-[var(--color-fog)]">
                {formatBytes(metrics.disk_used)} / {formatBytes(metrics.disk_total)}
              </div>
              <Bar pct={metrics.disk_percent} tone={metrics.disk_percent > 85 ? 'amber' : 'teal'} />
            </>
          )}
        </div>
        <Metric
          label="Network"
          value={
            metrics
              ? `↓ ${formatBytes(metrics.net_recv_ps)}/s`
              : '—'
          }
          hint={metrics ? `↑ ${formatBytes(metrics.net_sent_ps)}/s` : undefined}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)]/50 p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-display text-xl font-700">Services</h2>
            <Link to="/catalog" className="text-sm text-[var(--color-teal)] hover:underline">
              Install more
            </Link>
          </div>
          <div className="mt-5 space-y-3">
            {apps.length === 0 && (
              <p className="text-sm text-[var(--color-fog)]">
                Nothing installed yet. Open the catalog to launch your first app.
              </p>
            )}
            {apps.map((app) => (
              <div
                key={app.id}
                className="flex items-center justify-between gap-3 border-b border-[var(--color-line)]/60 py-3 last:border-0"
              >
                <div>
                  <div className="font-medium">{app.name}</div>
                  <div className="text-xs text-[var(--color-fog)]">{app.status}</div>
                </div>
                <span
                  className={`inline-flex items-center gap-2 text-xs ${
                    app.running ? 'text-[var(--color-teal)]' : 'text-[var(--color-fog)]'
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      app.running ? 'bg-[var(--color-teal)] shadow-[0_0_10px_var(--color-teal)]' : 'bg-[var(--color-fog)]'
                    }`}
                  />
                  {app.running ? 'running' : 'stopped'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)]/50 p-6">
          <h2 className="font-display text-xl font-700">Host</h2>
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--color-fog)]">Docker</dt>
              <dd className={docker ? 'text-[var(--color-teal)]' : 'text-[var(--color-rose)]'}>
                {docker ? 'connected' : 'offline'}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--color-fog)]">Uptime</dt>
              <dd>{metrics ? formatUptime(metrics.uptime_sec) : '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--color-fog)]">Platform</dt>
              <dd>{metrics?.platform || '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--color-fog)]">Apps running</dt>
              <dd>
                {running}/{apps.length}
              </dd>
            </div>
          </dl>
          <Link
            to="/apps"
            className="mt-6 inline-flex rounded-lg border border-[var(--color-line)] px-4 py-2 text-sm hover:border-[var(--color-teal)] hover:text-[var(--color-teal)]"
          >
            Manage apps
          </Link>
        </div>
      </section>
    </div>
  )
}
