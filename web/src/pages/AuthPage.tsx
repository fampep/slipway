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
  const [username, setUsername] = useState("master");
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
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-fade" />
      <div className="pointer-events-none absolute inset-0">
        <motion.div
          className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-[rgba(45,212,191,0.18)] blur-3xl"
          animate={{ x: [0, 40, 0], y: [0, 20, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute right-0 bottom-0 h-96 w-96 rounded-full bg-[rgba(56,189,248,0.14)] blur-3xl"
          animate={{ x: [0, -30, 0], y: [0, -25, 0] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-5 py-16 lg:grid-cols-[1.1fr_0.9fr]">
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-6"
        >
          <p className="text-sm uppercase tracking-[0.28em] text-[var(--color-teal)]">
            Docker-first seedbox panel
          </p>
          <h1 className="font-display max-w-xl text-5xl font-800 leading-[0.95] sm:text-7xl">
            Slipway
          </h1>
          <p className="max-w-lg text-lg text-[var(--color-fog)]">
            Install and steer your media stack with a live control surface —
            qBittorrent, Jellyfin, Sonarr, and more.
          </p>
        </motion.section>

        <motion.form
          onSubmit={submit}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.45 }}
          className="rounded-2xl border border-[var(--color-line)] bg-[rgba(13,26,36,0.85)] p-7 shadow-[0_30px_80px_rgba(0,0,0,0.35)] backdrop-blur"
        >
          <h2 className="font-display text-2xl font-700">
            {mode === "setup" ? "Create master account" : "Welcome back"}
          </h2>
          <p className="mt-2 text-sm text-[var(--color-fog)]">
            {mode === "setup"
              ? "First run — set the master username and password (8+ characters)."
              : "Sign in to manage your box."}
          </p>

          <label className="mt-6 block text-sm text-[var(--color-fog)]">
            Username
            <input
              className="mt-2 w-full rounded-lg border border-[var(--color-line)] bg-[var(--bg)] px-3 py-2.5 outline-none focus:border-[var(--color-teal)]"
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
              className="mt-2 w-full rounded-lg border border-[var(--color-line)] bg-[var(--bg)] px-3 py-2.5 outline-none focus:border-[var(--color-teal)]"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "setup" ? "new-password" : "current-password"}
              required
              minLength={mode === "setup" ? 8 : 1}
            />
          </label>

          {error && (
            <p className="mt-4 text-sm text-[var(--color-rose)]">{error}</p>
          )}

          <button
            disabled={busy}
            className="mt-6 w-full rounded-lg bg-[var(--color-teal)] px-4 py-3 font-semibold text-[var(--color-ink)] transition hover:brightness-110 disabled:opacity-60"
          >
            {busy ? "Working…" : mode === "setup" ? "Create account" : "Sign in"}
          </button>
        </motion.form>
      </div>
    </div>
  );
}
