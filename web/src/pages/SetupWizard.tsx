import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { api } from '../api'

type Step = 'welcome' | 'account' | 'host' | 'checks' | 'done'

const steps: Step[] = ['welcome', 'account', 'host', 'checks', 'done']

export function SetupWizard({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>('welcome')
  const [username, setUsername] = useState('master')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [publicURL, setPublicURL] = useState(() => `${window.location.protocol}//${window.location.host}`)
  const [docker, setDocker] = useState<boolean | null>(null)
  const [catalogCount, setCatalogCount] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api
      .setupStatus()
      .then((s) => {
        setDocker(!!s.docker)
        setCatalogCount(s.catalog_count ?? 0)
        if (s.suggested_url) setPublicURL(s.suggested_url)
        if (s.public_url) setPublicURL(s.public_url)
      })
      .catch(() => setDocker(false))
  }, [])

  const idx = steps.indexOf(step)

  async function finishAccount() {
    setError('')
    if (username.trim().length < 3) {
      setError('Username must be at least 3 characters')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setStep('host')
  }

  async function createPanel() {
    setBusy(true)
    setError('')
    try {
      await api.setup(username.trim(), password, {
        confirm_password: confirm,
        public_url: publicURL.trim(),
      })
      const health = await api.health()
      setDocker(health.docker)
      setStep('checks')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Setup failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-5 py-12">
        <div className="mb-7">
          <h1 className="text-4xl font-700 tracking-tight">
            Slip<span className="text-[var(--color-teal)]">way</span>
          </h1>
          <p className="mt-1.5 text-[var(--color-fog)]">Quick first-time setup.</p>
          <div className="mt-5 flex gap-1.5">
            {steps.map((s, i) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full ${
                  i <= idx ? 'bg-[var(--color-teal)]' : 'bg-[var(--color-panel-2)]'
                }`}
              />
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
            className="surface p-6"
          >
            {step === 'welcome' && (
              <div className="space-y-4">
                <h2 className="text-xl font-700">Welcome</h2>
                <p className="text-sm text-[var(--color-fog)]">
                  Install and control Docker apps on this server from one panel.
                </p>
                <button onClick={() => setStep('account')} className="btn btn-primary mt-2 w-full !py-3">
                  Start setup
                </button>
              </div>
            )}

            {step === 'account' && (
              <div className="space-y-4">
                <h2 className="text-xl font-700">Master account</h2>
                <label className="block text-sm text-[var(--color-fog)]">
                  Username
                  <input
                    className="field mt-1.5"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                  />
                </label>
                <label className="block text-sm text-[var(--color-fog)]">
                  Password
                  <input
                    type="password"
                    className="field mt-1.5"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                  />
                </label>
                <label className="block text-sm text-[var(--color-fog)]">
                  Confirm password
                  <input
                    type="password"
                    className="field mt-1.5"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                  />
                </label>
                {error && <p className="text-sm text-[var(--color-rose)]">{error}</p>}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setStep('welcome')} className="btn btn-ghost">
                    Back
                  </button>
                  <button onClick={() => void finishAccount()} className="btn btn-primary flex-1">
                    Continue
                  </button>
                </div>
              </div>
            )}

            {step === 'host' && (
              <div className="space-y-4">
                <h2 className="text-xl font-700">Public URL</h2>
                <p className="text-sm text-[var(--color-fog)]">
                  Used for Open links. You can change this later in Settings.
                </p>
                <label className="block text-sm text-[var(--color-fog)]">
                  URL or IP
                  <input
                    className="field mt-1.5"
                    value={publicURL}
                    onChange={(e) => setPublicURL(e.target.value)}
                    placeholder="http://YOUR_SERVER_IP:8080"
                  />
                </label>
                {error && <p className="text-sm text-[var(--color-rose)]">{error}</p>}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setStep('account')} className="btn btn-ghost">
                    Back
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => void createPanel()}
                    className="btn btn-primary flex-1"
                  >
                    {busy ? 'Creating…' : 'Create panel'}
                  </button>
                </div>
              </div>
            )}

            {step === 'checks' && (
              <div className="space-y-4">
                <h2 className="text-xl font-700">Ready check</h2>
                <div className="space-y-2 text-sm">
                  <Row ok label="Account" detail={username} />
                  <Row
                    ok={docker === true}
                    label="Docker"
                    detail={docker === true ? 'Connected' : 'Not reachable'}
                  />
                  <Row ok={catalogCount > 0} label="Catalog" detail={`${catalogCount} apps`} />
                  <Row ok label="Public URL" detail={publicURL || 'localhost'} />
                </div>
                <button onClick={() => setStep('done')} className="btn btn-primary w-full !py-3">
                  Continue
                </button>
              </div>
            )}

            {step === 'done' && (
              <div className="space-y-4">
                <h2 className="text-xl font-700">You&apos;re set</h2>
                <p className="text-sm text-[var(--color-fog)]">
                  Use the catalog to install apps, or open Overview for live metrics.
                </p>
                <button onClick={onDone} className="btn btn-primary w-full !py-3">
                  Enter Slipway
                </button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

function Row({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-[var(--bg)] px-3.5 py-3">
      <span
        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
          ok ? 'bg-[var(--ok)]' : 'bg-[var(--color-rose)]'
        }`}
      />
      <div>
        <div className="font-600">{label}</div>
        <div className="text-[var(--color-fog)]">{detail}</div>
      </div>
    </div>
  )
}
