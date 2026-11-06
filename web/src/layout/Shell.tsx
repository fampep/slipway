import { NavLink, Outlet } from "react-router-dom";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { api, type User } from "../api";

const links = [
  { to: "/", label: "Overview", end: true },
  { to: "/apps", label: "Apps" },
  { to: "/catalog", label: "Catalog" },
  { to: "/settings", label: "Settings" },
];

export function Shell({
  user,
  onLogout,
  children,
}: {
  user: User;
  onLogout: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <div className="pointer-events-none fixed inset-0 grid-fade" />
      <header className="relative z-10 border-b border-[var(--color-line)]/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
          <div className="flex items-center gap-8">
            <NavLink
              to="/"
              className="font-display text-xl font-700 tracking-tight text-[var(--color-snow)]"
            >
              Slip<span className="text-[var(--color-teal)]">way</span>
            </NavLink>
            <nav className="hidden items-center gap-1 sm:flex">
              {links.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.end}
                  className={({ isActive }) =>
                    `rounded-md px-3 py-1.5 text-sm transition ${
                      isActive
                        ? "bg-[var(--color-panel-2)] text-[var(--color-teal)]"
                        : "text-[var(--color-fog)] hover:text-[var(--color-snow)]"
                    }`
                  }
                >
                  {l.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-[var(--color-fog)]">
            <span className="hidden sm:inline">{user.username}</span>
            <button
              className="rounded-md border border-[var(--color-line)] px-3 py-1.5 hover:border-[var(--color-teal)] hover:text-[var(--color-teal)]"
              onClick={async () => {
                await api.logout();
                onLogout();
              }}
            >
              Log out
            </button>
          </div>
        </div>
      </header>
      <motion.main
        className="relative z-10 mx-auto max-w-6xl px-6 py-8"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        {children ?? <Outlet />}
      </motion.main>
    </div>
  );
}
