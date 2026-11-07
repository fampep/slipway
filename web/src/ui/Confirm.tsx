import { useEffect, useState, type ReactNode } from "react";

type ConfirmState = {
  title: string;
  body?: string;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
};

let openConfirm: ((opts: Omit<ConfirmState, "resolve">) => Promise<boolean>) | null = null;

export function confirmDialog(opts: Omit<ConfirmState, "resolve">): Promise<boolean> {
  if (!openConfirm) return Promise.resolve(window.confirm(opts.title));
  return openConfirm(opts);
}

export function ConfirmHost({ children }: { children?: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);

  useEffect(() => {
    openConfirm = (opts) =>
      new Promise((resolve) => {
        setState({ ...opts, resolve });
      });
    return () => {
      openConfirm = null;
    };
  }, []);

  return (
    <>
      {children}
      {state && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/55 px-4 backdrop-blur-sm">
          <div className="surface w-full max-w-md p-5 shadow-2xl" role="dialog" aria-modal="true">
            <h2 className="text-lg font-700">{state.title}</h2>
            {state.body && <p className="mt-2 text-sm text-[var(--color-fog)]">{state.body}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="btn btn-ghost"
                onClick={() => {
                  state.resolve(false);
                  setState(null);
                }}
              >
                Cancel
              </button>
              <button
                className={state.danger ? "btn btn-danger" : "btn btn-primary"}
                onClick={() => {
                  state.resolve(true);
                  setState(null);
                }}
              >
                {state.confirmLabel || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
