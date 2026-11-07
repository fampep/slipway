import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, type CatalogApp, type ImportPreview } from '../api'
import { AppIcon } from '../ui/AppIcon'
import { useToast } from '../ui/Toast'

export function AddApp() {
  const nav = useNavigate()
  const toast = useToast()
  const [mode, setMode] = useState<'link' | 'compose'>('link')
  const [url, setUrl] = useState('')
  const [compose, setCompose] = useState('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [draft, setDraft] = useState<CatalogApp | null>(null)
  const [multi, setMulti] = useState<(CatalogApp & { webui_port?: string })[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function toDraft(a: CatalogApp & { webui_port?: string }): CatalogApp {
    return {
      ...a,
      web_port: a.web_port || a.webui_port || a.ports?.[0]?.host || '8080',
      installed: false,
      running: false,
    }
  }

  async function runPreview() {
    setBusy(true)
    setError('')
    setPreview(null)
    setMulti([])
    try {
      const p =
        mode === 'compose'
          ? await api.importPreview('', compose)
          : await api.importPreview(url.trim())
      setPreview(p)
      if (p.apps && p.apps.length > 1) {
        setMulti(p.apps)
        setDraft(toDraft(p.apps[0]))
      } else {
        setDraft(toDraft(p.app as CatalogApp & { webui_port?: string }))
      }
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
      if (multi.length > 1) {
        await api.importSaveMany(
          multi.map((a) => ({
            id: a.id,
            name: a.name,
            description: a.description,
            category: a.category || 'custom',
            image: a.image,
            icon: a.icon,
            ports: a.ports,
            webui_port: a.web_port || a.webui_port || a.ports?.[0]?.host,
            source: preview?.source,
          })),
        )
        toast.push(`Saved ${multi.length} services`, 'ok')
      } else {
        await api.importSave({
          id: draft.id,
          name: draft.name,
          description: draft.description,
          category: draft.category || 'custom',
          image: draft.image,
          icon: draft.icon,
          website: draft.website,
          ports: draft.ports,
          webui_port: draft.web_port || draft.ports?.[0]?.host,
          source: preview?.source,
        })
        toast.push('Saved to catalog', 'ok')
      }
      nav(`/catalog`)
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
          Paste a GitHub repo, compose URL, image, or raw docker-compose YAML.
        </p>
      </div>

      <div className="flex gap-2">
        <button
          className={`btn !py-1.5 ${mode === 'link' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setMode('link')}
        >
          Link / image
        </button>
        <button
          className={`btn !py-1.5 ${mode === 'compose' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setMode('compose')}
        >
          Paste compose
        </button>
      </div>

      <div className="surface p-5">
        {mode === 'link' ? (
          <label className="block text-sm text-[var(--color-fog)]">
            Link or image
            <input
              className="field mt-1.5"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/org/repo  or  lscr.io/linuxserver/nginx:latest"
            />
          </label>
        ) : (
          <label className="block text-sm text-[var(--color-fog)]">
            docker-compose.yml
            <textarea
              className="field mt-1.5 min-h-[12rem] font-mono text-xs"
              value={compose}
              onChange={(e) => setCompose(e.target.value)}
              placeholder={"services:\n  app:\n    image: nginx:latest\n    ports:\n      - \"8080:80\""}
            />
          </label>
        )}
        <button
          disabled={busy || (mode === 'link' ? !url.trim() : !compose.trim())}
          onClick={() => void runPreview()}
          className="btn btn-primary mt-4"
        >
          {busy ? 'Working…' : 'Preview'}
        </button>
      </div>

      {error && <p className="text-sm text-[var(--color-rose)]">{error}</p>}

      {multi.length > 1 && (
        <div className="surface p-5">
          <h2 className="font-700">{multi.length} services found</h2>
          <p className="mt-1 text-sm text-[var(--color-fog)]">Saving will import all of them as custom catalog apps.</p>
          <ul className="mt-3 space-y-1 text-sm">
            {multi.map((a) => (
              <li key={a.id} className="font-mono text-xs">
                {a.id} · {a.image}
              </li>
            ))}
          </ul>
        </div>
      )}

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

          {multi.length <= 1 && (
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
            </div>
          )}

          <button disabled={busy} onClick={() => void save()} className="btn btn-primary">
            {busy ? 'Saving…' : multi.length > 1 ? `Save ${multi.length} apps` : 'Save to catalog'}
          </button>
        </div>
      )}
    </div>
  )
}
