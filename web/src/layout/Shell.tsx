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
      <header className="sticky top-0 z-20 border-b border-[var(--color-line)] bg-[rgba(11,16,22,0.82)] backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-3.5">
          <div className="flex items-center gap-7">
            <NavLink to="/" className="text-lg font-700 tracking-tight">
              Slip<span className="text-[var(--color-teal)]">way</span>
            </NavLink>
            <nav className="hidden items-center gap-5 sm:flex">
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
          <div className="flex items-center gap-3 text-sm text-[var(--color-fog)]">
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
        className="mx-auto max-w-5xl px-5 py-8"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
      >
        {children ?? <Outlet />}
      </motion.main>
    </div>
  );
}
