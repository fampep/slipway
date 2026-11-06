import { AnimatePresence, motion } from "framer-motion";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type ToastTone = "ok" | "error" | "info";

type ToastItem = {
  id: number;
  message: string;
  tone: ToastTone;
};

type ToastApi = {
  push: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastApi>({ push: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((message: string, tone: ToastTone = "info") => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, message, tone }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  const api = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className={`pointer-events-auto rounded-xl border px-4 py-2.5 text-sm shadow-lg backdrop-blur-md ${
                t.tone === "ok"
                  ? "border-[rgba(52,211,153,0.35)] bg-[rgba(18,25,37,0.95)] text-[var(--ok)]"
                  : t.tone === "error"
                    ? "border-[rgba(251,113,133,0.35)] bg-[rgba(18,25,37,0.95)] text-[var(--color-rose)]"
                    : "border-[var(--color-line)] bg-[rgba(18,25,37,0.95)] text-[var(--color-snow)]"
              }`}
            >
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
