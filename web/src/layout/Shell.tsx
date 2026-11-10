import { NavLink, Outlet } from "react-router-dom";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { api, type User } from "../api";
import { CommandPalette } from "../ui/CommandPalette";

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
    <div className="min-h-screen pb-20 sm:pb-0">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-[var(--color-teal)] focus:px-3 focus:py-2 focus:text-[var(--color-ink)]"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-20 border-b border-[var(--color-line)] bg-[rgba(11,16,22,0.82)] backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-3.5">
          <div className="flex items-center gap-7">
            <NavLink to="/" className="font-display text-lg font-700 tracking-tight" aria-label="Slipway home">
              Slip<span className="text-[var(--color-teal)]">way</span>
            </NavLink>
            <nav className="hidden items-center gap-5 sm:flex" aria-label="Primary">
              {links.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.end}
                  className={({ isActive }) =>
                    `text-sm transition ${
                      isActive
                        ? "font-600 text-[var(--color-snow)]"
                        : "text-[var(--color-fog)] hover:text-[var(--color-snow)]"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <span className="relative pb-0.5">
                      {l.label}
                      {isActive && (
                        <span className="absolute inset-x-0 -bottom-2 h-0.5 rounded-full bg-[var(--color-teal)]" />
                      )}
                    </span>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2 text-sm text-[var(--color-fog)]">
            <button
              type="button"
              className="btn btn-ghost !hidden !px-3 !py-1.5 !text-sm sm:!inline-flex"
              onClick={() => window.dispatchEvent(new Event("slipway:palette"))}
              aria-label="Open command palette"
              title="Ctrl/⌘ K"
            >
              Search
              <kbd className="ml-1 rounded border border-[var(--color-line)] px-1.5 text-[10px] text-[var(--color-fog)]">
                ⌘K
              </kbd>
            </button>
            <span className="hidden rounded-full bg-[var(--color-panel-2)] px-2.5 py-1 sm:inline">
              {user.username}
            </span>
            <button
              className="btn btn-ghost !px-3 !py-1.5 !text-sm !font-500"
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
        id="main"
        className="mx-auto max-w-5xl px-5 py-8"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
      >
        {children ?? <Outlet />}
      </motion.main>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--color-line)] bg-[rgba(11,16,22,0.92)] backdrop-blur-md sm:hidden"
        aria-label="Mobile"
      >
        <div className="mx-auto grid max-w-5xl grid-cols-4 px-2 py-2">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `rounded-lg px-2 py-2 text-center text-xs ${
                  isActive ? "font-600 text-[var(--color-teal)]" : "text-[var(--color-fog)]"
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </div>
      </nav>
      <CommandPalette />
    </div>
  );
}
