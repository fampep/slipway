import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { api, type CatalogApp, type ProgressEvent } from '../api'

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
    <div className="space-y-8">
      <section>
        <p className="text-sm uppercase tracking-[0.18em] text-[var(--color-teal)]">Catalog</p>
        <h1 className="mt-2 font-display text-4xl font-800 tracking-tight">Launch apps</h1>
        <p className="mt-2 max-w-xl text-[var(--color-fog)]">
          One-click installs backed by Docker images — curated for media stacks.
        </p>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search apps"
          className="w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2.5 outline-none focus:border-[var(--color-teal)] sm:max-w-sm"
        />
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-md px-3 py-1.5 text-sm capitalize ${
                category === c
                  ? 'bg-[var(--color-teal)] text-[var(--color-ink)]'
                  : 'border border-[var(--color-line)] text-[var(--color-fog)] hover:text-[var(--color-snow)]'
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
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-xl border border-[var(--color-teal)]/40 bg-[var(--color-panel)] p-4"
          >
            <div className="flex items-center justify-between text-sm">
              <span>{progress.message}</span>
              <span className="text-[var(--color-teal)]">{progress.percent ?? 0}%</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--color-panel-2)]">
              <motion.div
                className="h-full bg-[var(--color-teal)]"
                animate={{ width: `${progress.percent ?? 0}%` }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="divide-y divide-[var(--color-line)]/70 rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)]/40">
        {filtered.map((app, i) => (
          <motion.div
            key={app.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <div className="flex items-center gap-3">
                <h3 className="font-display text-lg font-700">{app.name}</h3>
                <span className="rounded bg-[var(--color-panel-2)] px-2 py-0.5 text-xs capitalize text-[var(--color-fog)]">
                  {app.category}
                </span>
              </div>
              <p className="mt-1 max-w-2xl text-sm text-[var(--color-fog)]">{app.description}</p>
              <p className="mt-2 font-mono text-xs text-[var(--color-fog)]/80">{app.image}</p>
            </div>
            <div className="shrink-0">
              {app.installed ? (
                <span className="text-sm text-[var(--color-teal)]">
                  {app.running ? 'Installed · running' : 'Installed'}
                </span>
              ) : (
                <button
                  disabled={busyId !== null}
                  onClick={() => install(app.id)}
                  className="rounded-lg bg-[var(--color-teal)] px-4 py-2 text-sm font-semibold text-[var(--color-ink)] hover:brightness-110 disabled:opacity-50"
                >
                  {busyId === app.id ? 'Installing…' : 'Install'}
                </button>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
