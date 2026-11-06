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
  const [publicURL, setPublicURL] = useState('https://198.50.123.153')
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
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-fade" />
      <div className="pointer-events-none absolute inset-0">
        <motion.div
          className="absolute -left-20 top-16 h-72 w-72 rounded-full bg-[rgba(47,224,197,0.16)] blur-3xl"
          animate={{ x: [0, 30, 0], y: [0, 18, 0] }}
          transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-5 py-12">
        <div className="mb-8">
          <p className="text-sm uppercase tracking-[0.22em] text-[var(--color-teal)]">First-time setup</p>
          <h1 className="mt-2 font-display text-4xl font-800 tracking-tight sm:text-5xl">
            Slip<span className="text-[var(--color-teal)]">way</span>
          </h1>
          <p className="mt-2 text-[var(--color-fog)]">
            A short guided setup — no terminal needed.
          </p>
          <div className="mt-6 flex gap-2">
            {steps.map((s, i) => (
              <div
                key={s}
                className={`h-1.5 flex-1 rounded-full ${
                  i <= idx ? 'bg-[var(--color-teal)]' : 'bg-[var(--color-panel-2)]'
                }`}
              />
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28 }}
            className="rounded-2xl border border-[var(--color-line)] bg-[rgba(13,26,36,0.88)] p-7 backdrop-blur"
          >
            {step === 'welcome' && (
              <div className="space-y-5">
                <h2 className="font-display text-2xl font-700">Welcome</h2>
                <p className="text-[var(--color-fog)]">
                  Slipway installs and controls Docker apps on this server — Silo, Emby, Plex,
                  Sonarr, and more — from one clean panel.
                </p>
                <ul className="space-y-2 text-sm text-[var(--color-fog)]">
                  <li>• Create your master account</li>
                  <li>• Set how you reach the box (IP / URL)</li>
                  <li>• Confirm Docker is ready</li>
                </ul>
                <button
                  onClick={() => setStep('account')}
                  className="mt-2 w-full rounded-lg bg-[var(--color-teal)] px-4 py-3 font-semibold text-[var(--color-ink)]"
                >
                  Start setup
                </button>
              </div>
            )}

            {step === 'account' && (
              <div className="space-y-4">
                <h2 className="font-display text-2xl font-700">Master account</h2>
                <p className="text-sm text-[var(--color-fog)]">
                  This is the admin login for the panel.
                </p>
                <label className="block text-sm text-[var(--color-fog)]">
                  Username
                  <input
                    className="mt-1.5 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-ink)] px-3 py-2.5 outline-none focus:border-[var(--color-teal)]"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                  />
                </label>
                <label className="block text-sm text-[var(--color-fog)]">
                  Password
                  <input
                    type="password"
                    className="mt-1.5 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-ink)] px-3 py-2.5 outline-none focus:border-[var(--color-teal)]"
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
                    className="mt-1.5 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-ink)] px-3 py-2.5 outline-none focus:border-[var(--color-teal)]"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                  />
                </label>
                {error && <p className="text-sm text-[var(--color-rose)]">{error}</p>}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setStep('welcome')}
                    className="rounded-lg border border-[var(--color-line)] px-4 py-2.5 text-sm"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => void finishAccount()}
                    className="flex-1 rounded-lg bg-[var(--color-teal)] px-4 py-2.5 font-semibold text-[var(--color-ink)]"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}

            {step === 'host' && (
              <div className="space-y-4">
                <h2 className="font-display text-2xl font-700">How you connect</h2>
                <p className="text-sm text-[var(--color-fog)]">
                  Used for Open links to apps like Silo, Emby, and Plex. You can change this later
                  in Settings.
                </p>
                <label className="block text-sm text-[var(--color-fog)]">
                  Public URL or IP
                  <input
                    className="mt-1.5 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-ink)] px-3 py-2.5 outline-none focus:border-[var(--color-teal)]"
                    value={publicURL}
                    onChange={(e) => setPublicURL(e.target.value)}
                    placeholder="https://198.50.123.153"
                  />
                </label>
                <p className="text-xs text-[var(--color-fog)]">
                  Example: <code className="text-[var(--color-snow)]">https://198.50.123.153</code>
                </p>
                {error && <p className="text-sm text-[var(--color-rose)]">{error}</p>}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setStep('account')}
                    className="rounded-lg border border-[var(--color-line)] px-4 py-2.5 text-sm"
                  >
                    Back
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => void createPanel()}
                    className="flex-1 rounded-lg bg-[var(--color-teal)] px-4 py-2.5 font-semibold text-[var(--color-ink)] disabled:opacity-60"
                  >
                    {busy ? 'Creating panel…' : 'Create panel'}
                  </button>
                </div>
              </div>
            )}

            {step === 'checks' && (
              <div className="space-y-5">
                <h2 className="font-display text-2xl font-700">System check</h2>
                <div className="space-y-3 text-sm">
                  <Row ok label="Master account" detail={`Signed in as ${username}`} />
                  <Row
                    ok={docker === true}
                    label="Docker Engine"
                    detail={
                      docker === true
                        ? 'Connected — apps can be installed from the catalog'
                        : 'Not reachable yet — Slipway needs the Docker socket'
                    }
                  />
                  <Row
                    ok={catalogCount > 0}
                    label="App catalog"
                    detail={`${catalogCount} apps ready (includes Silo, Emby, Plex)`}
                  />
                  <Row ok label="Public base" detail={publicURL || 'localhost'} />
                </div>
                <button
                  onClick={() => setStep('done')}
                  className="w-full rounded-lg bg-[var(--color-teal)] px-4 py-3 font-semibold text-[var(--color-ink)]"
                >
                  Continue
                </button>
              </div>
            )}

            {step === 'done' && (
              <div className="space-y-5">
                <h2 className="font-display text-2xl font-700">You&apos;re set</h2>
                <p className="text-[var(--color-fog)]">
                  Open the catalog to install Silo or other apps, or jump to the overview for live
                  host metrics. Everything runs from this UI.
                </p>
                <button
                  onClick={onDone}
                  className="w-full rounded-lg bg-[var(--color-teal)] px-4 py-3 font-semibold text-[var(--color-ink)]"
                >
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
    <div className="flex items-start gap-3 rounded-xl border border-[var(--color-line)]/80 px-4 py-3">
      <span
        className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
          ok ? 'bg-[var(--color-teal)] shadow-[0_0_10px_var(--color-teal)]' : 'bg-[var(--color-rose)]'
        }`}
      />
      <div>
        <div className="font-medium text-[var(--color-snow)]">{label}</div>
        <div className="text-[var(--color-fog)]">{detail}</div>
      </div>
    </div>
  )
}
