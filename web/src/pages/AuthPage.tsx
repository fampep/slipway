import { motion } from "framer-motion";
import { useState, type FormEvent } from "react";
import { api } from "../api";

export function AuthPage({
  mode,
  onSuccess,
}: {
  mode: "setup" | "login";
  onSuccess: () => void;
}) {
  const [username, setUsername] = useState(mode === "login" ? "fampep" : "master");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "setup") await api.setup(username, password);
      else await api.login(username, password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="landing relative min-h-screen overflow-hidden">
      <div className="landing-glow" aria-hidden />
      <div className="landing-grid" aria-hidden />

      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-5 py-16 lg:grid lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-16">
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="mb-12 lg:mb-0"
        >
          <p className="text-sm font-600 tracking-[0.18em] text-[var(--color-teal)] uppercase">
            Media panel
          </p>
          <h1 className="font-display mt-4 text-6xl font-700 tracking-tight sm:text-7xl lg:text-8xl">
            Slip<span className="text-[var(--color-teal)]">way</span>
          </h1>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-[var(--color-fog)]">
            Install, watch, and run your Docker media stack from one calm control surface.
          </p>
          <motion.div
            className="mt-10 hidden gap-8 text-sm text-[var(--color-fog)] sm:flex"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25, duration: 0.4 }}
          >
            <div>
              <div className="font-600 text-[var(--color-snow)]">Host aware</div>
              <div className="mt-1">Adopts apps already running</div>
            </div>
            <div>
              <div className="font-600 text-[var(--color-snow)]">One install</div>
              <div className="mt-1">Compose up and open the panel</div>
            </div>
          </motion.div>
        </motion.section>

        <motion.form
          onSubmit={submit}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          className="surface landing-card p-6 sm:p-8"
        >
          <h2 className="text-xl font-700">
            {mode === "setup" ? "Create account" : "Sign in"}
          </h2>
          <p className="mt-1.5 text-sm text-[var(--color-fog)]">
            {mode === "setup"
              ? "First run — choose a username and password."
              : "Enter your panel credentials."}
          </p>

          <label className="mt-7 block text-sm text-[var(--color-fog)]">
            Username
            <input
              className="field mt-1.5"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label className="mt-4 block text-sm text-[var(--color-fog)]">
            Password
            <input
              type="password"
              className="field mt-1.5"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "setup" ? "new-password" : "current-password"}
              required
              minLength={mode === "setup" ? 8 : 1}
            />
          </label>

          {error && <p className="mt-4 text-sm text-[var(--color-rose)]">{error}</p>}

          <button disabled={busy} className="btn btn-primary mt-7 w-full !py-3">
            {busy ? "Working…" : mode === "setup" ? "Create account" : "Sign in"}
          </button>
        </motion.form>
      </div>
    </div>
  );
}
