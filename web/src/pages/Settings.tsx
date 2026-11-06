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
    <div className="space-y-8">
      <section>
        <p className="text-sm uppercase tracking-[0.18em] text-[var(--color-teal)]">Settings</p>
        <h1 className="mt-2 font-display text-4xl font-800 tracking-tight">Panel</h1>
        <p className="mt-2 max-w-xl text-[var(--color-fog)]">
          Configure how Slipway links to apps on this Linux host — no terminal required.
        </p>
      </section>

      <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)]/50 p-6">
        <h2 className="font-display text-xl font-700">Status</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--color-fog)]">API</dt>
            <dd className="text-[var(--color-teal)]">{health?.ok ? 'ok' : 'checking…'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--color-fog)]">Docker</dt>
            <dd className={health?.docker ? 'text-[var(--color-teal)]' : 'text-[var(--color-rose)]'}>
              {health?.docker ? 'connected' : 'unavailable'}
            </dd>
          </div>
        </dl>
      </div>

      <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)]/50 p-6">
        <h2 className="font-display text-xl font-700">Public URL</h2>
        <p className="mt-2 text-sm text-[var(--color-fog)]">
          Used for Open buttons (Silo, Emby, Plex, …). Usually your server IP or HTTPS host.
        </p>
        <input
          className="mt-4 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-ink)] px-3 py-2.5 outline-none focus:border-[var(--color-teal)]"
          value={publicURL}
          onChange={(e) => setPublicURL(e.target.value)}
          placeholder="https://198.50.123.153"
        />
        {error && <p className="mt-3 text-sm text-[var(--color-rose)]">{error}</p>}
        {saved && <p className="mt-3 text-sm text-[var(--color-teal)]">Saved</p>}
        <button
          disabled={busy}
          onClick={() => void save()}
          className="mt-4 rounded-lg bg-[var(--color-teal)] px-4 py-2.5 text-sm font-semibold text-[var(--color-ink)] disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
