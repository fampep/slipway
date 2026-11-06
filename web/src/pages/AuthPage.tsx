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
    <div className="relative min-h-screen">
      <div className="mx-auto grid min-h-screen max-w-5xl items-center gap-10 px-5 py-14 lg:grid-cols-2">
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="space-y-4"
        >
          <h1 className="text-5xl font-700 tracking-tight sm:text-6xl">
            Slip<span className="text-[var(--color-teal)]">way</span>
          </h1>
          <p className="max-w-md text-lg text-[var(--color-fog)]">
            A clean panel for your Docker media stack.
          </p>
        </motion.section>

        <motion.form
          onSubmit={submit}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.35 }}
          className="surface p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-7"
        >
          <h2 className="text-xl font-700">
            {mode === "setup" ? "Create account" : "Sign in"}
          </h2>
          <p className="mt-1.5 text-sm text-[var(--color-fog)]">
            {mode === "setup"
              ? "First run — choose a username and password."
              : "Enter your panel credentials."}
          </p>

          <label className="mt-6 block text-sm text-[var(--color-fog)]">
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

          <button disabled={busy} className="btn btn-primary mt-6 w-full !py-3">
            {busy ? "Working…" : mode === "setup" ? "Create account" : "Sign in"}
          </button>
        </motion.form>
      </div>
    </div>
  );
}
