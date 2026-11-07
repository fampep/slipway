import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type InstalledApp } from '../api'
import { AppIcon } from '../ui/AppIcon'
import { confirmDialog } from '../ui/Confirm'
import { useToast } from '../ui/Toast'

type Filter = 'all' | 'running' | 'stopped' | 'external' | 'unhealthy'

function healthBadge(health?: string) {
  if (!health) return null
  if (health === 'healthy') return <span className="badge badge-ok">healthy</span>
  if (health === 'unhealthy') return <span className="badge badge-danger">unhealthy</span>
  if (health === 'starting') return <span className="badge badge-muted">starting</span>
  return <span className="badge badge-muted">{health}</span>
}

export function Apps() {
  const toast = useToast()
  const [apps, setApps] = useState<InstalledApp[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)

  async function refresh() {
    setApps(await api.apps())
  }

  useEffect(() => {
    refresh().catch((e) => setError(e.message))
  }, [])

  const filtered = useMemo(() => {
    return apps.filter((a) => {
      if (filter === 'running' && !a.running) return false
      if (filter === 'stopped' && a.running) return false
      if (filter === 'external' && !a.external) return false
      if (filter === 'unhealthy' && a.health !== 'unhealthy') return false
      if (!q.trim()) return true
      const hay = `${a.name} ${a.description} ${a.category} ${a.container_name || ''}`.toLowerCase()
      return hay.includes(q.toLowerCase())
    })
  }, [apps, filter, q])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set())
      return
    }
    setSelected(new Set(filtered.map((a) => a.id)))
  }

  async function act(id: string, fn: (id: string) => Promise<unknown>, okMsg?: string) {
    setBusy(id)
    setError('')
    try {
      await fn(id)
      await refresh()
      if (okMsg) toast.push(okMsg, 'ok')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Action failed'
      setError(msg)
      toast.push(msg, 'error')
    } finally {
      setBusy(null)
    }
  }

  async function bulk(action: 'start' | 'stop' | 'restart') {
    const ids = Array.from(selected)
    if (!ids.length) return
    setBulkBusy(true)
    setError('')
    try {
      const res = await api.bulkApps(action, ids)
      const failed = res.results.filter((r) => !r.ok)
      if (failed.length) {
        const msg = failed.map((f) => `${f.id}: ${f.error}`).join('; ')
        setError(msg)
        toast.push(msg, 'error')
      } else {
        toast.push(`${action} · ${ids.length} apps`, 'ok')
      }
      setSelected(new Set())
      await refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Bulk action failed'
      setError(msg)
      toast.push(msg, 'error')
    } finally {
      setBulkBusy(false)
    }
  }

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'running', label: 'Running' },
    { id: 'stopped', label: 'Stopped' },
    { id: 'external', label: 'On host' },
    { id: 'unhealthy', label: 'Unhealthy' },
  ]

  return (
    <div className="space-y-7">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-700 tracking-tight">Apps</h1>
          <p className="mt-1.5 text-[var(--color-fog)]">
            Running services — including ones already on this host.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-ghost"
            disabled={bulkBusy}
            onClick={async () => {
              setBulkBusy(true)
              setError('')
              try {
                const res = await api.checkAllUpdates(false)
                const n = res.results.filter((r) => r.update_available).length
                toast.push(n ? `${n} update(s) available` : 'All up to date', n ? 'info' : 'ok')
              } catch (e) {
                toast.push(e instanceof Error ? e.message : 'Check failed', 'error')
              } finally {
                setBulkBusy(false)
              }
            }}
          >
            Check updates
          </button>
          <button
            className="btn btn-ghost"
            disabled={bulkBusy}
            onClick={async () => {
              if (!(await confirmDialog({ title: 'Update all managed apps with newer images?', confirmLabel: 'Update all' }))) return
              setBulkBusy(true)
              try {
                for await (const ev of api.updateAllStream()) {
                  if (ev.status === 'error') toast.push(ev.message, 'error')
                  else if (ev.status === 'ready') toast.push(ev.message, 'ok')
                  else if (ev.status === 'done') toast.push(ev.message, 'ok')
                }
                await refresh()
              } catch (e) {
                toast.push(e instanceof Error ? e.message : 'Update-all failed', 'error')
              } finally {
                setBulkBusy(false)
              }
            }}
          >
            Update all
          </button>
          <Link to="/catalog" className="btn btn-primary">
            Browse catalog
          </Link>
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            className="field sm:max-w-xs"
          />
          <div className="flex flex-wrap gap-1.5">
            {filters.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`btn !py-1.5 !text-sm ${filter === f.id ? 'btn-primary' : 'btn-ghost'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {selected.size > 0 && (
          <div className="flex flex-wrap gap-2">
            <button disabled={bulkBusy} onClick={() => bulk('start')} className="btn btn-ghost !py-1.5">
              Start ({selected.size})
            </button>
            <button disabled={bulkBusy} onClick={() => bulk('stop')} className="btn btn-ghost !py-1.5">
              Stop
            </button>
            <button disabled={bulkBusy} onClick={() => bulk('restart')} className="btn btn-ghost !py-1.5">
              Restart
            </button>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-[var(--color-rose)]">{error}</p>}

      {filtered.length === 0 ? (
        <div className="surface border-dashed px-6 py-12 text-center text-[var(--color-fog)]">
          {apps.length === 0
            ? 'No apps detected yet. Install from the catalog, or start a matching Docker container on the host.'
            : 'No apps match this filter.'}
        </div>
      ) : (
        <div className="surface divide-y divide-[var(--color-line)] overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-2.5 text-xs text-[var(--color-fog)]">
            <input
              type="checkbox"
              checked={selected.size > 0 && selected.size === filtered.length}
              onChange={toggleAll}
              className="accent-[var(--color-teal)]"
            />
            <span>
              {selected.size ? `${selected.size} selected` : `${filtered.length} apps`}
            </span>
          </div>
          {filtered.map((app) => (
            <div key={app.id} className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(app.id)}
                  onChange={() => toggle(app.id)}
                  className="mt-2 accent-[var(--color-teal)]"
                />
                <AppIcon icon={app.icon} name={app.name} size="md" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/apps/${app.id}`} className="text-lg font-700 hover:text-[var(--color-teal)]">
                      {app.name}
                    </Link>
                    <span className={`badge ${app.running ? 'badge-ok' : 'badge-muted'}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${app.running ? 'bg-[var(--ok)]' : 'bg-[var(--color-fog)]'}`} />
                      {app.running ? 'running' : app.status || 'stopped'}
                    </span>
                    {healthBadge(app.health)}
                    {app.external && <span className="badge badge-accent">on host</span>}
                    {app.compose_project && (
                      <span className="badge badge-muted">stack:{app.compose_project}</span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-[var(--color-fog)]">{app.description}</p>
                  {app.container_name && (
                    <p className="mt-1 font-mono text-xs text-[var(--color-fog)]/70">{app.container_name}</p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {app.url && (
                  <a href={app.url} target="_blank" rel="noreferrer" className="btn btn-ghost !py-1.5">
                    Open
                  </a>
                )}
                {app.running ? (
                  <button disabled={busy === app.id} onClick={() => act(app.id, api.stop, 'Stopped')} className="btn btn-ghost !py-1.5">
                    Stop
                  </button>
                ) : (
                  <button disabled={busy === app.id} onClick={() => act(app.id, api.start, 'Started')} className="btn btn-ghost !py-1.5">
                    Start
                  </button>
                )}
                <button disabled={busy === app.id} onClick={() => act(app.id, api.restart, 'Restarted')} className="btn btn-ghost !py-1.5">
                  Restart
                </button>
                <button
                  disabled={busy === app.id}
                  onClick={async () => {
                    const ok = await confirmDialog({
                      title: app.external
                        ? `Unlink ${app.name}?`
                        : `Remove ${app.name}?`,
                      body: app.external
                        ? 'The existing container will keep running.'
                        : 'This deletes the Slipway-managed container.',
                      confirmLabel: app.external ? 'Unlink' : 'Remove',
                      danger: true,
                    })
                    if (ok) act(app.id, api.remove, app.external ? 'Unlinked' : 'Removed')
                  }}
                  className="btn btn-danger !py-1.5"
                >
                  {app.external ? 'Unlink' : 'Remove'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
