import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type InstalledApp } from '../api'

export function Apps() {
  const [apps, setApps] = useState<InstalledApp[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  async function refresh() {
    setApps(await api.apps())
  }

  useEffect(() => {
    refresh().catch((e) => setError(e.message))
  }, [])

  async function act(id: string, fn: (id: string) => Promise<unknown>) {
    setBusy(id)
    setError('')
    try {
      await fn(id)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-7">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-700 tracking-tight">Apps</h1>
          <p className="mt-1.5 text-[var(--color-fog)]">
            Running services — including ones already on this host.
          </p>
        </div>
        <Link to="/catalog" className="btn btn-primary">
          Browse catalog
        </Link>
      </section>

      {error && <p className="text-sm text-[var(--color-rose)]">{error}</p>}

      {apps.length === 0 ? (
        <div className="surface border-dashed px-6 py-12 text-center text-[var(--color-fog)]">
          No apps detected yet. Install from the catalog, or start a matching Docker container on the host.
        </div>
      ) : (
        <div className="surface divide-y divide-[var(--color-line)] overflow-hidden">
          {apps.map((app) => (
            <div key={app.id} className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-700">{app.name}</h3>
                  <span className={`badge ${app.running ? 'badge-ok' : 'badge-muted'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${app.running ? 'bg-[var(--ok)]' : 'bg-[var(--color-fog)]'}`} />
                    {app.running ? 'running' : app.status || 'stopped'}
                  </span>
                  {app.external && <span className="badge badge-accent">on host</span>}
                </div>
                <p className="mt-1 text-sm text-[var(--color-fog)]">{app.description}</p>
                {app.container_name && (
                  <p className="mt-1 font-mono text-xs text-[var(--color-fog)]/70">{app.container_name}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {app.url && (
                  <a href={app.url} target="_blank" rel="noreferrer" className="btn btn-ghost !py-1.5">
                    Open
                  </a>
                )}
                {app.running ? (
                  <button disabled={busy === app.id} onClick={() => act(app.id, api.stop)} className="btn btn-ghost !py-1.5">
                    Stop
                  </button>
                ) : (
                  <button disabled={busy === app.id} onClick={() => act(app.id, api.start)} className="btn btn-ghost !py-1.5">
                    Start
                  </button>
                )}
                <button disabled={busy === app.id} onClick={() => act(app.id, api.restart)} className="btn btn-ghost !py-1.5">
                  Restart
                </button>
                <button
                  disabled={busy === app.id}
                  onClick={() => {
                    const msg = app.external
                      ? `Unlink ${app.name} from Slipway? The existing container will keep running.`
                      : `Remove ${app.name} and delete its container?`
                    if (confirm(msg)) act(app.id, api.remove)
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
