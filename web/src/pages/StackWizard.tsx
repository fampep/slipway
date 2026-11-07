import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type ProgressEvent } from '../api'
import { AppIcon } from '../ui/AppIcon'
import { useToast } from '../ui/Toast'

type StackApp = {
  id: string
  name: string
  description: string
  installed: boolean
  running: boolean
  in_catalog: boolean
}

export function StackWizard() {
  const toast = useToast()
  const [apps, setApps] = useState<StackApp[]>([])
  const [media, setMedia] = useState('')
  const [downloads, setDownloads] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [progress, setProgress] = useState<ProgressEvent | null>(null)
  const [error, setError] = useState('')

  async function refresh() {
    const s = await api.stackRecommend()
    setApps(s.apps)
    setMedia(s.media_path || '')
    setDownloads(s.downloads_path || '')
  }

  useEffect(() => {
    refresh().catch((e) => setError(e.message))
  }, [])

  async function savePaths() {
    const cur = await api.getSettings()
    await api.saveSettings({
      public_url: cur.public_url || '',
      webhook_url: cur.webhook_url,
      media_path: media.trim(),
      downloads_path: downloads.trim(),
    })
    toast.push('Paths saved', 'ok')
  }

  async function installOne(id: string) {
    setBusyId(id)
    setError('')
    setProgress({ status: 'starting', message: 'Installing…', percent: 0 })
    try {
      await savePaths()
      for await (const ev of api.installStream(id)) {
        setProgress(ev)
        if (ev.status === 'error') throw new Error(ev.message)
      }
      await refresh()
      toast.push(`Installed ${id}`, 'ok')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Install failed'
      setError(msg)
      toast.push(msg, 'error')
    } finally {
      setBusyId(null)
      setTimeout(() => setProgress(null), 1000)
    }
  }

  async function installMissing() {
    for (const a of apps) {
      if (!a.installed && a.in_catalog) {
        await installOne(a.id)
      }
    }
  }

  return (
    <div className="space-y-7">
      <div>
        <Link to="/catalog" className="text-sm text-[var(--color-fog)] hover:text-[var(--color-teal)]">
          ← Catalog
        </Link>
        <h1 className="font-display mt-3 text-3xl font-700 tracking-tight">Arr stack</h1>
        <p className="mt-1.5 text-[var(--color-fog)]">
          Recommended install order for indexers, *arr, and a media server.
        </p>
      </div>

      <div className="surface space-y-3 p-5">
        <h2 className="text-lg font-700">Library paths</h2>
        <p className="text-sm text-[var(--color-fog)]">
          Used when installing apps that mount media/downloads (overrides relative catalog paths).
        </p>
        <label className="block text-sm text-[var(--color-fog)]">
          Media
          <input
            className="field mt-1.5"
            value={media}
            onChange={(e) => setMedia(e.target.value)}
            placeholder="/home/user/storage/media"
          />
        </label>
        <label className="block text-sm text-[var(--color-fog)]">
          Downloads
          <input
            className="field mt-1.5"
            value={downloads}
            onChange={(e) => setDownloads(e.target.value)}
            placeholder="/home/user/storage/downloads"
          />
        </label>
        <button className="btn btn-ghost" onClick={() => void savePaths()}>
          Save paths
        </button>
      </div>

      {error && <p className="text-sm text-[var(--color-rose)]">{error}</p>}
      {progress && (
        <div className="surface p-4 text-sm">
          {progress.message} · {progress.percent ?? 0}%
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={!!busyId} onClick={() => void installMissing()}>
          Install missing
        </button>
      </div>

      <div className="surface divide-y divide-[var(--color-line)] overflow-hidden">
        {apps.map((a, i) => (
          <div key={a.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="mt-1 font-mono text-xs text-[var(--color-fog)]">{i + 1}</span>
              <AppIcon icon={a.id} name={a.name} size="md" />
              <div>
                <div className="font-700">{a.name}</div>
                <p className="text-sm text-[var(--color-fog)]">{a.description}</p>
              </div>
            </div>
            <div className="flex gap-2">
              {a.installed ? (
                <Link to={`/apps/${a.id}`} className="btn btn-ghost">
                  {a.running ? 'Open' : 'Details'}
                </Link>
              ) : a.in_catalog ? (
                <button
                  className="btn btn-primary"
                  disabled={!!busyId}
                  onClick={() => void installOne(a.id)}
                >
                  {busyId === a.id ? 'Installing…' : 'Install'}
                </button>
              ) : (
                <span className="badge badge-muted">not in catalog</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
