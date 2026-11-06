import { useEffect, useState } from 'react'
import { api, type Health } from '../api'
import { useToast } from '../ui/Toast'

export function Settings() {
  const toast = useToast()
  const [health, setHealth] = useState<Health | null>(null)
  const [publicURL, setPublicURL] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [nginx, setNginx] = useState('')
  const [caddy, setCaddy] = useState('')

  useEffect(() => {
    api.health().then(setHealth).catch(() => {})
    api.getSettings().then((s) => setPublicURL(s.public_url || '')).catch(() => {})
    api.proxySnippet().then((p) => {
      setNginx(p.nginx)
      setCaddy(p.caddy)
    }).catch(() => {})
  }, [])

  async function save() {
    setBusy(true)
    setError('')
    setSaved(false)
    try {
      await api.saveSettings({ public_url: publicURL.trim() })
      setSaved(true)
      toast.push('Settings saved', 'ok')
      const p = await api.proxySnippet()
      setNginx(p.nginx)
      setCaddy(p.caddy)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed'
      setError(msg)
      toast.push(msg, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function downloadExport() {
    const data = await api.exportConfig()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'slipway-export.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="space-y-7">
      <section>
        <h1 className="text-3xl font-700 tracking-tight">Settings</h1>
        <p className="mt-1.5 text-[var(--color-fog)]">Panel connection, proxy, and export.</p>
      </section>

      <div className="surface p-5">
        <h2 className="text-lg font-700">Status</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--color-fog)]">API</dt>
            <dd className="text-[var(--ok)]">{health?.ok ? 'ok' : 'checking…'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--color-fog)]">Docker</dt>
            <dd className={health?.docker ? 'text-[var(--ok)]' : 'text-[var(--color-rose)]'}>
              {health?.docker ? 'connected' : 'unavailable'}
            </dd>
          </div>
        </dl>
      </div>

      <div className="surface p-5">
        <h2 className="text-lg font-700">Public URL</h2>
        <p className="mt-1.5 text-sm text-[var(--color-fog)]">
          Used for Open links to apps like Silo, Emby, and Plex.
        </p>
        <input
          className="field mt-4"
          value={publicURL}
          onChange={(e) => setPublicURL(e.target.value)}
          placeholder="http://YOUR_SERVER_IP:8080"
        />
        {error && <p className="mt-3 text-sm text-[var(--color-rose)]">{error}</p>}
        {saved && <p className="mt-3 text-sm text-[var(--ok)]">Saved</p>}
        <button disabled={busy} onClick={() => void save()} className="btn btn-primary mt-4">
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="surface p-5">
        <h2 className="text-lg font-700">Reverse proxy</h2>
        <p className="mt-1.5 text-sm text-[var(--color-fog)]">
          Snippets to put Slipway behind nginx or Caddy on port 80/443.
        </p>
        <h3 className="mt-4 text-sm font-600">nginx</h3>
        <pre className="mt-2 overflow-auto rounded-xl bg-[var(--bg)] p-3 font-mono text-xs text-[var(--color-fog)] whitespace-pre-wrap">
          {nginx || '…'}
        </pre>
        <h3 className="mt-4 text-sm font-600">Caddy</h3>
        <pre className="mt-2 overflow-auto rounded-xl bg-[var(--bg)] p-3 font-mono text-xs text-[var(--color-fog)] whitespace-pre-wrap">
          {caddy || '…'}
        </pre>
      </div>

      <div className="surface p-5">
        <h2 className="text-lg font-700">Export</h2>
        <p className="mt-1.5 text-sm text-[var(--color-fog)]">
          Download settings and custom catalog apps as JSON.
        </p>
        <button onClick={() => void downloadExport()} className="btn btn-ghost mt-4">
          Download export
        </button>
      </div>
    </div>
  )
}
