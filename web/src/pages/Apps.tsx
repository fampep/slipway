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
    <div className="space-y-8">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-[var(--color-teal)]">Apps</p>
          <h1 className="mt-2 font-display text-4xl font-800 tracking-tight">Installed services</h1>
          <p className="mt-2 text-[var(--color-fog)]">Start, stop, restart, or remove containers.</p>
        </div>
        <Link
          to="/catalog"
          className="inline-flex rounded-lg bg-[var(--color-teal)] px-4 py-2 text-sm font-semibold text-[var(--color-ink)]"
        >
          Browse catalog
        </Link>
      </section>

      {error && <p className="text-sm text-[var(--color-rose)]">{error}</p>}

      {apps.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--color-line)] p-10 text-center text-[var(--color-fog)]">
          No apps installed yet.
        </p>
      ) : (
        <div className="space-y-3">
          {apps.map((app) => (
            <div
              key={app.id}
              className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)]/50 p-5"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="font-display text-xl font-700">{app.name}</h3>
                    <span
                      className={`text-xs ${app.running ? 'text-[var(--color-teal)]' : 'text-[var(--color-fog)]'}`}
                    >
                      {app.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[var(--color-fog)]">{app.description}</p>
                  <p className="mt-2 font-mono text-xs text-[var(--color-fog)]/70">{app.container_name}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {app.url && (
                    <a
                      href={app.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-[var(--color-line)] px-3 py-1.5 text-sm hover:border-[var(--color-teal)] hover:text-[var(--color-teal)]"
                    >
                      Open
                    </a>
                  )}
                  {app.running ? (
                    <button
                      disabled={busy === app.id}
                      onClick={() => act(app.id, api.stop)}
                      className="rounded-md border border-[var(--color-line)] px-3 py-1.5 text-sm"
                    >
                      Stop
                    </button>
                  ) : (
                    <button
                      disabled={busy === app.id}
                      onClick={() => act(app.id, api.start)}
                      className="rounded-md border border-[var(--color-line)] px-3 py-1.5 text-sm"
                    >
                      Start
                    </button>
                  )}
                  <button
                    disabled={busy === app.id}
                    onClick={() => act(app.id, api.restart)}
                    className="rounded-md border border-[var(--color-line)] px-3 py-1.5 text-sm"
                  >
                    Restart
                  </button>
                  <button
                    disabled={busy === app.id}
                    onClick={() => {
                      if (confirm(`Remove ${app.name}?`)) act(app.id, api.remove)
                    }}
                    className="rounded-md border border-[var(--color-rose)]/40 px-3 py-1.5 text-sm text-[var(--color-rose)]"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
