import { useMemo, useState } from "react";

type Size = "sm" | "md" | "lg";

const sizes: Record<Size, string> = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
};

function hashColor(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 42% 38%)`;
}

/** Resolve icon: GitHub/https URL first, then local cache /icons/{id}.svg from those repos. */
function resolveCandidates(icon?: string, name?: string): string[] {
  const raw = (icon || "").trim();
  const out: string[] = [];
  if (/^https?:\/\//i.test(raw)) {
    out.push(raw);
    // Also try local cache by guessing id from filename
    try {
      const path = new URL(raw).pathname;
      const base = path.split("/").pop() || "";
      const id = base.replace(/\.(svg|png|webp)$/i, "").replace(/-server$/i, "");
      if (id) {
        out.push(`/icons/${id}.svg`, `/icons/${id}.png`);
      }
    } catch {
      /* ignore */
    }
  } else if (raw.startsWith("/")) {
    out.push(raw);
  } else if (raw) {
    const id = raw.replace(/[^a-zA-Z0-9._-]/g, "").toLowerCase();
    out.push(`/icons/${id}.svg`, `/icons/${id}.png`);
  }
  const fallbackId = (name || "app").toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (fallbackId) out.push(`/icons/${fallbackId}.svg`);
  out.push("/icons/app.svg");
  return [...new Set(out)];
}

export function AppIcon({
  icon,
  name,
  size = "md",
  className = "",
}: {
  icon?: string;
  name: string;
  size?: Size;
  className?: string;
}) {
  const candidates = useMemo(() => resolveCandidates(icon, name), [icon, name]);
  const [idx, setIdx] = useState(0);
  const [failed, setFailed] = useState(false);
  const letter = (name || "?").trim().charAt(0).toUpperCase() || "?";
  const bg = hashColor(icon || name || "app");
  const src = candidates[Math.min(idx, candidates.length - 1)];

  if (failed || !src) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-xl font-700 text-white ${sizes[size]} ${className}`}
        style={{ background: bg }}
        aria-hidden
      >
        {letter}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      className={`shrink-0 rounded-xl bg-[var(--color-panel-2)] object-contain p-1 ${sizes[size]} ${className}`}
      onError={() => {
        if (idx + 1 < candidates.length) setIdx((i) => i + 1);
        else setFailed(true);
      }}
    />
  );
}
