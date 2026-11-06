import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { api, type User } from "./api";
import { Shell } from "./layout/Shell";
import { AuthPage } from "./pages/AuthPage";
import { SetupWizard } from "./pages/SetupWizard";
import { AddApp } from "./pages/AddApp";
import { AppDetail } from "./pages/AppDetail";
import { Apps } from "./pages/Apps";
import { Catalog } from "./pages/Catalog";
import { Overview } from "./pages/Overview";
import { Settings } from "./pages/Settings";

type Gate =
  | { status: "loading" }
  | { status: "setup" }
  | { status: "login" }
  | { status: "ready"; user: User };

export default function App() {
  const [gate, setGate] = useState<Gate>({ status: "loading" });

  const refresh = async () => {
    const setup = await api.setupStatus();
    if (setup.setup_needed) {
      setGate({ status: "setup" });
      return;
    }
    try {
      const me = await api.me();
      setGate({ status: "ready", user: me });
    } catch {
      setGate({ status: "login" });
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  if (gate.status === "loading") {
    return (
      <div className="grid min-h-screen place-items-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-2xl font-700 tracking-tight"
        >
          Slip<span className="text-[var(--color-teal)]">way</span>
        </motion.div>
      </div>
    );
  }

  if (gate.status === "setup") {
    return (
      <SetupWizard
        onDone={async () => {
          await refresh();
        }}
      />
    );
  }

  if (gate.status === "login") {
    return (
      <AuthPage
        mode="login"
        onSuccess={async () => {
          await refresh();
        }}
      />
    );
  }

  return (
    <Shell user={gate.user} onLogout={() => setGate({ status: "login" })}>
      <AnimatePresence mode="wait">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/apps" element={<Apps />} />
          <Route path="/apps/:id" element={<AppDetail />} />
          <Route path="/catalog" element={<Catalog />} />
          <Route path="/catalog/add" element={<AddApp />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>
    </Shell>
  );
}
