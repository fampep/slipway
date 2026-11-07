import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { api, type CatalogApp, type ProgressEvent } from '../api'
import { AppIcon } from '../ui/AppIcon'
import { useToast } from '../ui/Toast'

const FEATURED = ['silo', 'jellyfin', 'plex', 'emby', 'radarr', 'sonarr']

export function Catalog() {
  const toast = useToast()
  const [apps, setApps] = useState<CatalogApp[]>([])
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('all')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [progress, setProgress] = useState<ProgressEvent | null>(null)
  const [error, setError] = useState('')

  async function refresh() {
    setApps(await api.catalog())
  }

  useEffect(() => {
    refresh().catch((e) => setError(e.message))
  }, [])

  const categories = useMemo(() => {
    const set = new Set(apps.map((a) => a.category))
    return ['all', ...Array.from(set).sort()]
  }, [apps])

  const featured = useMemo(() => {
    const byId = new Map(apps.map((a) => [a.id, a]))
    return FEATURED.map((id) => byId.get(id)).filter(Boolean) as CatalogApp[]
  }, [apps])

  const filtered = useMemo(() => {
    return apps.filter((a) => {
      if (category !== 'all' && a.category !== category) return false
      if (!q.trim()) return true
      const hay = `${a.name} ${a.description} ${a.category}`.toLowerCase()
      return hay.includes(q.toLowerCase())
    })
  }, [apps, q, category])

  async function install(id: string) {
    setBusyId(id)
    setError('')
    try {
      const ports = await api.portCheck(id)
      if (!ports.ok && ports.conflicts.length) {
        const detail = ports.conflicts.map((c) => `${c.port} used by ${c.used_by}`).join(', ')
        if (!confirm(`Port conflict: ${detail}. Install anyway?`)) {
          setBusyId(null)
          return
        }
      }
    } catch {
      /* ignore port check failures */
    }
    setProgress({ status: 'starting', message: 'Starting install…', percent: 0 })
    try {
      for await (const ev of api.installStream(id)) {
        setProgress(ev)
        if (ev.status === 'error') throw new Error(ev.message)
      }
      await refresh()
      toast.push('Installed', 'ok')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Install failed'
      setError(msg)
      toast.push(msg, 'error')
    } finally {
      setBusyId(null)
      setTimeout(() => setProgress(null), 1200)
    }
  }

  async function removeCustom(id: string) {
    if (!confirm(`Remove custom catalog entry ${id}?`)) return
    try {
      await api.deleteCustom(id)
      await refresh()
      toast.push('Custom app removed', 'ok')
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Remove failed', 'error')
    }
  }

  return (
    <div className="space-y-7">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-700 tracking-tight">Catalog</h1>
          <p className="mt-1.5 text-[var(--color-fog)]">
            One-click installs — or paste your own from GitHub.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/catalog/stack" className="btn btn-ghost">
            Arr stack
          </Link>
          <Link to="/catalog/add" className="btn btn-primary">
            Add app
          </Link>
        </div>
      </section>

      {!q && category === 'all' && featured.length > 0 && (
        <section>
          <h2 className="text-sm font-600 tracking-wide text-[var(--color-fog)] uppercase">Featured</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((app) => (
              <div key={app.id} className="surface flex items-center gap-3 p-4">
                <AppIcon icon={app.icon} name={app.name} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="font-600">{app.name}</div>
                  <div className="truncate text-xs text-[var(--color-fog)]">{app.description}</div>
                </div>
                {app.installed ? (
                  <Link to={`/apps/${app.id}`} className="btn btn-ghost !py-1.5 !text-sm">
                    Open
                  </Link>
                ) : (
                  <button
                    disabled={busyId !== null}
                    onClick={() => install(app.id)}
                    className="btn btn-primary !py-1.5 !text-sm"
                  >
                    {busyId === app.id ? '…' : 'Install'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search apps"
          className="field sm:max-w-xs"
        />
        <div className="flex flex-wrap gap-1.5">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-full px-3 py-1 text-sm capitalize transition ${
                category === c
                  ? 'bg-[var(--accent-soft)] font-600 text-[var(--color-teal)]'
                  : 'text-[var(--color-fog)] hover:text-[var(--color-snow)]'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-[var(--color-rose)]">{error}</p>}

      <AnimatePresence>
        {progress && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="surface p-4"
          >
            <div className="flex items-center justify-between text-sm">
              <span>{progress.message}</span>
              <span className="font-600 text-[var(--color-teal)]">{progress.percent ?? 0}%</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--color-panel-2)]">
              <motion.div
                className="h-full rounded-full bg-[var(--color-teal)]"
                animate={{ width: `${progress.percent ?? 0}%` }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {filtered.length === 0 ? (
        <div className="surface border-dashed px-6 py-12 text-center">
          <p className="text-[var(--color-fog)]">No apps match. Try another search, or add your own.</p>
          <Link to="/catalog/add" className="btn btn-primary mt-5">
            Add from GitHub
          </Link>
        </div>
      ) : (
        <div className="surface divide-y divide-[var(--color-line)] overflow-hidden">
          {filtered.map((app) => (
            <div
              key={app.id}
              className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-start gap-3">
                <AppIcon icon={app.icon} name={app.name} size="md" />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-700">{app.name}</h3>
                    <span className="badge badge-muted capitalize">{app.category}</span>
                    {app.installed && app.external && <span className="badge badge-accent">on host</span>}
                    {app.custom && <span className="badge badge-accent">custom</span>}
                  </div>
                  <p className="mt-1 max-w-2xl text-sm text-[var(--color-fog)]">{app.description}</p>
                  {!!app.tags?.length && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {app.tags.map((t) => (
                        <span key={t} className="badge badge-muted">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                {app.custom && !app.installed && (
                  <button className="btn btn-danger" onClick={() => void removeCustom(app.id)}>
                    Delete
                  </button>
                )}
                {app.installed ? (
                  <>
                    <Link to={`/apps/${app.id}`} className="btn btn-ghost">
                      Details
                    </Link>
                    <span className={`badge self-center ${app.running ? 'badge-ok' : 'badge-muted'}`}>
                      {app.running ? 'Active' : 'Installed'}
                    </span>
                  </>
                ) : (
                  <button
                    disabled={busyId !== null}
                    onClick={() => install(app.id)}
                    className="btn btn-primary"
                  >
                    {busyId === app.id ? 'Installing…' : 'Install'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
