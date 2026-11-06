import { useEffect, useState } from 'react'
import { api, type Health } from '../api'
import { useToast } from '../ui/Toast'

export function Settings() {
  const toast = useToast()
  const [health, setHealth] = useState<Health | null>(null)
  const [publicURL, setPublicURL] = useState('')
  const [webhookURL, setWebhookURL] = useState('')
  const [suggested, setSuggested] = useState('')
  const [version, setVersion] = useState('dev')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [nginx, setNginx] = useState('')
  const [caddy, setCaddy] = useState('')
  const [currentPass, setCurrentPass] = useState('')
  const [newPass, setNewPass] = useState('')

  useEffect(() => {
    api.health().then(setHealth).catch(() => {})
    api.getSettings().then((s) => {
      setPublicURL(s.public_url || '')
      setWebhookURL(s.webhook_url || '')
      setSuggested(s.suggested_url || '')
      if (s.version) setVersion(s.version)
    }).catch(() => {})
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
      const out = await api.saveSettings({
        public_url: publicURL.trim(),
        webhook_url: webhookURL.trim(),
      })
      setSaved(true)
      if (out.version) setVersion(out.version)
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

  async function changePassword() {
    setBusy(true)
    setError('')
    try {
      await api.changePassword(currentPass, newPass)
      setCurrentPass('')
      setNewPass('')
      toast.push('Password updated', 'ok')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Password change failed'
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
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-700 tracking-tight">Settings</h1>
          <p className="mt-1.5 text-[var(--color-fog)]">Panel connection, proxy, and export.</p>
        </div>
        <span className="badge badge-muted">v{version}</span>
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
          <div className="flex justify-between gap-4">
            <dt className="text-[var(--color-fog)]">Version</dt>
            <dd className="font-mono text-xs">{version}</dd>
          </div>
        </dl>
      </div>

      <div className="surface p-5">
        <h2 className="text-lg font-700">Public URL</h2>
        <p className="mt-1.5 text-sm text-[var(--color-fog)]">
          Used for Open links (host + app port + path).
        </p>
        <input
          className="field mt-4"
          value={publicURL}
          onChange={(e) => setPublicURL(e.target.value)}
          placeholder={suggested || 'http://YOUR_SERVER_IP:8080'}
        />
        {suggested && (
          <button
            type="button"
            className="mt-2 text-sm text-[var(--color-teal)] hover:underline"
            onClick={() => setPublicURL(suggested)}
          >
            Use suggested: {suggested}
          </button>
        )}
        <h3 className="mt-6 text-sm font-600">Webhook (optional)</h3>
        <p className="mt-1 text-sm text-[var(--color-fog)]">Discord/Slack-compatible URL for later alerts.</p>
        <input
          className="field mt-2"
          value={webhookURL}
          onChange={(e) => setWebhookURL(e.target.value)}
          placeholder="https://hooks.example.com/..."
        />
        {error && <p className="mt-3 text-sm text-[var(--color-rose)]">{error}</p>}
        {saved && <p className="mt-3 text-sm text-[var(--ok)]">Saved</p>}
        <button disabled={busy} onClick={() => void save()} className="btn btn-primary mt-4">
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="surface p-5">
        <h2 className="text-lg font-700">Change password</h2>
        <label className="mt-4 block text-sm text-[var(--color-fog)]">
          Current
          <input
            type="password"
            className="field mt-1.5"
            value={currentPass}
            onChange={(e) => setCurrentPass(e.target.value)}
          />
        </label>
        <label className="mt-3 block text-sm text-[var(--color-fog)]">
          New (min 8)
          <input
            type="password"
            className="field mt-1.5"
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
            minLength={8}
          />
        </label>
        <button
          disabled={busy || !currentPass || newPass.length < 8}
          onClick={() => void changePassword()}
          className="btn btn-ghost mt-4"
        >
          Update password
        </button>
      </div>

      <div className="surface p-5">
        <h2 className="text-lg font-700">Reverse proxy</h2>
        <p className="mt-1.5 text-sm text-[var(--color-fog)]">
          Put Slipway behind nginx or Caddy. Bind to localhost with{' '}
          <code className="text-[var(--color-teal)]">SLIPWAY_BIND=127.0.0.1</code>.
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
        <h2 className="text-lg font-700">Export / backup</h2>
        <p className="mt-1.5 text-sm text-[var(--color-fog)]">
          Download settings + custom catalog. Panel DB volume:{' '}
          <code className="text-xs">docker volume ls | grep slipway</code>
        </p>
        <button onClick={() => void downloadExport()} className="btn btn-ghost mt-4">
          Download export
        </button>
      </div>
    </div>
  )
}
