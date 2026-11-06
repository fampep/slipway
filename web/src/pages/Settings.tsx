import { useEffect, useState } from 'react'
import { api, type Health } from '../api'

export function Settings() {
  const [health, setHealth] = useState<Health | null>(null)
  const [publicURL, setPublicURL] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.health().then(setHealth).catch(() => {})
    api.getSettings().then((s) => setPublicURL(s.public_url || '')).catch(() => {})
  }, [])

  async function save() {
    setBusy(true)
    setError('')
    setSaved(false)
    try {
      await api.saveSettings({ public_url: publicURL.trim() })
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-7">
      <section>
        <h1 className="text-3xl font-700 tracking-tight">Settings</h1>
        <p className="mt-1.5 text-[var(--color-fog)]">Panel connection and host status.</p>
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
    </div>
  )
}
