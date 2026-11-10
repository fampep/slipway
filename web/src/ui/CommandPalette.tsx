import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type CatalogApp, type InstalledApp } from "../api";
import { useToast } from "./Toast";

type Item = {
  id: string;
  label: string;
  hint?: string;
  group: string;
  run: () => void | Promise<void>;
};

export function CommandPalette() {
  const nav = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [catalog, setCatalog] = useState<CatalogApp[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const openPalette = () => {
      setOpen(true);
      setQ("");
      setActive(0);
    };
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if ((meta && e.key.toLowerCase() === "k") || (e.key === "/" && !isTyping(e))) {
        e.preventDefault();
        openPalette();
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("slipway:palette", openPalette);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("slipway:palette", openPalette);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    void Promise.all([api.apps(), api.catalog()])
      .then(([a, c]) => {
        setApps(a);
        setCatalog(c);
      })
      .catch(() => {});
  }, [open]);

  const items = useMemo(() => {
    const out: Item[] = [
      { id: "nav-home", label: "Go to Overview", group: "Navigate", run: () => nav("/") },
      { id: "nav-apps", label: "Go to Apps", group: "Navigate", run: () => nav("/apps") },
      { id: "nav-catalog", label: "Go to Catalog", group: "Navigate", run: () => nav("/catalog") },
      { id: "nav-stack", label: "Arr stack wizard", group: "Navigate", run: () => nav("/catalog/stack") },
      { id: "nav-add", label: "Add custom app", group: "Navigate", run: () => nav("/catalog/add") },
      { id: "nav-settings", label: "Go to Settings", group: "Navigate", run: () => nav("/settings") },
    ];
    for (const a of apps) {
      out.push({
        id: `app-${a.id}`,
        label: a.name,
        hint: a.running ? "running" : "stopped",
        group: "Apps",
        run: () => nav(`/apps/${a.id}`),
      });
      if (a.url) {
        out.push({
          id: `open-${a.id}`,
          label: `Open ${a.name}`,
          hint: a.url,
          group: "Quick open",
          run: () => window.open(a.url, "_blank", "noreferrer"),
        });
      }
      out.push({
        id: `act-${a.id}`,
        label: a.running ? `Stop ${a.name}` : `Start ${a.name}`,
        group: "Actions",
        run: async () => {
          try {
            if (a.running) await api.stop(a.id);
            else await api.start(a.id);
            toast.push(a.running ? "Stopped" : "Started", "ok");
          } catch (e) {
            toast.push(e instanceof Error ? e.message : "Failed", "error");
          }
        },
      });
    }
    for (const c of catalog.filter((x) => !x.installed)) {
      out.push({
        id: `cat-${c.id}`,
        label: `Install ${c.name}`,
        hint: c.category,
        group: "Catalog",
        run: () => nav(`/catalog?install=${c.id}`),
      });
    }
    const needle = q.trim().toLowerCase();
    if (!needle) return out;
    return out.filter(
      (i) =>
        i.label.toLowerCase().includes(needle) ||
        i.hint?.toLowerCase().includes(needle) ||
        i.group.toLowerCase().includes(needle),
    );
  }, [apps, catalog, nav, q, toast]);

  useEffect(() => setActive(0), [q, open]);

  async function run(item: Item) {
    setOpen(false);
    await item.run();
  }

  if (!open) return null;

  const grouped = items.reduce<Record<string, Item[]>>((acc, item) => {
    (acc[item.group] ||= []).push(item);
    return acc;
  }, {});

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-start bg-black/55 px-4 pt-[12vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
      role="presentation"
    >
      <div
        className="surface w-full max-w-xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <input
          ref={inputRef}
          className="field !rounded-none !border-0 !border-b border-[var(--color-line)] !bg-transparent"
          placeholder="Search apps, actions, pages…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, items.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && items[active]) {
              e.preventDefault();
              void run(items[active]);
            }
          }}
        />
        <div className="max-h-[50vh] overflow-auto p-2">
          {items.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-[var(--color-fog)]">No matches</p>
          )}
          {Object.entries(grouped).map(([group, list]) => (
            <div key={group} className="mb-2">
              <div className="px-3 py-1.5 text-xs font-600 tracking-wide text-[var(--color-fog)] uppercase">
                {group}
              </div>
              {list.map((item) => {
                const idx = items.indexOf(item);
                return (
                  <button
                    key={item.id}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                      idx === active ? "bg-[var(--accent-soft)] text-[var(--color-teal)]" : "hover:bg-[var(--color-panel-2)]"
                    }`}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => void run(item)}
                  >
                    <span className="font-500">{item.label}</span>
                    {item.hint && <span className="truncate pl-3 text-xs text-[var(--color-fog)]">{item.hint}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="border-t border-[var(--color-line)] px-3 py-2 text-xs text-[var(--color-fog)]">
          ↑↓ navigate · Enter run · Esc close · Ctrl/⌘ K
        </div>
      </div>
    </div>
  );
}

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || t.isContentEditable;
}
