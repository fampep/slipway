import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, type CatalogApp, type ImportPreview } from '../api'
import { AppIcon } from '../ui/AppIcon'

export function AddApp() {
  const nav = useNavigate()
  const [url, setUrl] = useState('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [draft, setDraft] = useState<CatalogApp | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function runPreview() {
    setBusy(true)
    setError('')
    setPreview(null)
    try {
      const p = await api.importPreview(url.trim())
      setPreview(p)
      const a = p.app as CatalogApp & { webui_port?: string }
      setDraft({
        ...a,
        web_port: a.web_port || a.webui_port || a.ports?.[0]?.host || '8080',
        installed: false,
        running: false,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (!draft) return
    setBusy(true)
    setError('')
    try {
      const saved = await api.importSave({
        id: draft.id,
        name: draft.name,
        description: draft.description,
        category: draft.category || 'custom',
        image: draft.image,
        icon: draft.icon,
        website: draft.website,
        ports: draft.ports,
        web_port: draft.web_port || draft.ports?.[0]?.host,
        source: preview?.source,
      })
      nav(`/catalog`)
      // keep saved for lint
      void saved
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-7">
      <div>
        <Link to="/catalog" className="text-sm text-[var(--color-fog)] hover:text-[var(--color-teal)]">
          ← Catalog
        </Link>
        <h1 className="mt-3 text-3xl font-700 tracking-tight">Add app</h1>
        <p className="mt-1.5 text-[var(--color-fog)]">
          Paste a GitHub repo, compose URL, or container image.
        </p>
      </div>

      <div className="surface p-5">
        <label className="block text-sm text-[var(--color-fog)]">
          Link or image
          <input
            className="field mt-1.5"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/org/repo  or  lscr.io/linuxserver/nginx:latest"
          />
        </label>
        <button disabled={busy || !url.trim()} onClick={() => void runPreview()} className="btn btn-primary mt-4">
          {busy ? 'Working…' : 'Preview'}
        </button>
      </div>

      {error && <p className="text-sm text-[var(--color-rose)]">{error}</p>}

      {draft && (
        <div className="surface space-y-4 p-5">
          <div className="flex items-center gap-3">
            <AppIcon icon={draft.icon} name={draft.name} size="md" />
            <div>
              <div className="font-700">{draft.name}</div>
              <div className="font-mono text-xs text-[var(--color-fog)]">{draft.image}</div>
            </div>
          </div>

          {preview?.warnings?.map((w) => (
            <p key={w} className="text-sm text-[var(--color-amber)]">
              {w}
            </p>
          ))}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-[var(--color-fog)]">
              ID
              <input className="field mt-1" value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value })} />
            </label>
            <label className="text-sm text-[var(--color-fog)]">
              Name
              <input className="field mt-1" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <label className="text-sm text-[var(--color-fog)] sm:col-span-2">
              Description
              <input
                className="field mt-1"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </label>
            <label className="text-sm text-[var(--color-fog)]">
              Image
              <input className="field mt-1" value={draft.image} onChange={(e) => setDraft({ ...draft, image: e.target.value })} />
            </label>
            <label className="text-sm text-[var(--color-fog)]">
              Web port
              <input
                className="field mt-1"
                value={draft.web_port || ''}
                onChange={(e) => setDraft({ ...draft, web_port: e.target.value })}
              />
            </label>
            <label className="text-sm text-[var(--color-fog)] sm:col-span-2">
              Icon URL (GitHub raw / avatar)
              <input className="field mt-1" value={draft.icon || ''} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} />
            </label>
          </div>

          <button disabled={busy} onClick={() => void save()} className="btn btn-primary">
            {busy ? 'Saving…' : 'Save to catalog'}
          </button>
        </div>
      )}
    </div>
  )
}
