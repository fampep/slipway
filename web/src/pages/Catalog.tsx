import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { api, type CatalogApp, type ProgressEvent } from '../api'
import { AppIcon } from '../ui/AppIcon'
import { confirmDialog } from '../ui/Confirm'
import { PageSkeleton } from '../ui/Skeleton'
import { useToast } from '../ui/Toast'

const FEATURED = ['silo', 'jellyfin', 'plex', 'emby', 'radarr', 'sonarr']

export function Catalog() {
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [apps, setApps] = useState<CatalogApp[]>([])
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('all')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [progress, setProgress] = useState<ProgressEvent | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [envEdit, setEnvEdit] = useState<{ id: string; env: Record<string, string> } | null>(null)

  async function refresh() {
    setApps(await api.catalog())
  }

  useEffect(() => {
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const id = params.get('install')
    if (!id || loading || !apps.length) return
    const app = apps.find((a) => a.id === id && !a.installed)
    if (app) void beginInstall(app)
    setParams({}, { replace: true })
  }, [params, loading, apps])

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
      const hay = `${a.name} ${a.description} ${a.category} ${a.image} ${(a.tags || []).join(' ')} ${a.web_port || ''}`.toLowerCase()
      return hay.includes(q.toLowerCase())
    })
  }, [apps, q, category])

  async function beginInstall(app: CatalogApp) {
    if (app.env && Object.keys(app.env).length) {
      setEnvEdit({ id: app.id, env: { ...app.env } })
      return
    }
    await install(app.id)
  }

  async function install(id: string, env?: Record<string, string>) {
    setBusyId(id)
    setError('')
    setEnvEdit(null)
    try {
      const ports = await api.portCheck(id)
      if (!ports.ok && ports.conflicts.length) {
        const detail = ports.conflicts.map((c) => `${c.port} used by ${c.used_by}`).join(', ')
        const ok = await confirmDialog({
          title: 'Port conflict',
          body: `${detail}. Install anyway?`,
          confirmLabel: 'Install anyway',
          danger: true,
        })
        if (!ok) {
          setBusyId(null)
          return
        }
      }
    } catch {
      /* ignore port check failures */
    }
    setProgress({ status: 'starting', message: 'Starting install…', percent: 0 })
    try {
      for await (const ev of api.installStream(id, env ? { env } : undefined)) {
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

  if (loading) return <PageSkeleton />

  return (
    <div className="space-y-7">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-700 tracking-tight">Catalog</h1>
          <p className="mt-1.5 text-[var(--color-fog)]">
            One-click installs — or paste your own from GitHub. Press ⌘K to search everywhere.
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
                    onClick={() => void beginInstall(app)}
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
          placeholder="Search name, image, tag, port…"
          className="field sm:max-w-xs"
          aria-label="Search catalog"
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
                    onClick={() => void beginInstall(app)}
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

      {envEdit && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 px-4 backdrop-blur-sm">
          <div className="surface w-full max-w-lg p-5" role="dialog" aria-modal="true" aria-label="Environment">
            <h2 className="text-lg font-700">Environment for {envEdit.id}</h2>
            <p className="mt-1 text-sm text-[var(--color-fog)]">Adjust values before install.</p>
            <div className="mt-4 max-h-72 space-y-3 overflow-auto">
              {Object.keys(envEdit.env).map((k) => (
                <label key={k} className="block text-sm text-[var(--color-fog)]">
                  {k}
                  <input
                    className="field mt-1 font-mono text-xs"
                    value={envEdit.env[k]}
                    onChange={(e) =>
                      setEnvEdit({
                        ...envEdit,
                        env: { ...envEdit.env, [k]: e.target.value },
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn btn-ghost" onClick={() => setEnvEdit(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={() => void install(envEdit.id, envEdit.env)}>
                Install
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
