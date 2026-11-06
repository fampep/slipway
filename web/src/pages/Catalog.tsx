import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { api, type CatalogApp, type ProgressEvent } from '../api'
import { AppIcon } from '../ui/AppIcon'

export function Catalog() {
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
    setProgress({ status: 'starting', message: 'Starting install…', percent: 0 })
    try {
      for await (const ev of api.installStream(id)) {
        setProgress(ev)
        if (ev.status === 'error') throw new Error(ev.message)
      }
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Install failed')
    } finally {
      setBusyId(null)
      setTimeout(() => setProgress(null), 1200)
    }
  }

  return (
    <div className="space-y-7">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-700 tracking-tight">Catalog</h1>
          <p className="mt-1.5 text-[var(--color-fog)]">
            Install apps, or see what’s already active on this host.
          </p>
        </div>
        <Link to="/catalog/add" className="btn btn-primary">
          Add app
        </Link>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search"
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
                </div>
                <p className="mt-1 max-w-2xl text-sm text-[var(--color-fog)]">{app.description}</p>
              </div>
            </div>
            <div className="shrink-0">
              {app.installed ? (
                <span className={`badge ${app.running ? 'badge-ok' : 'badge-muted'}`}>
                  {app.running ? 'Active' : 'Installed'}
                </span>
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
    </div>
  )
}
