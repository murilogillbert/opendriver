import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

export type ToastTone = "info" | "success" | "warning" | "error";

export type Toast = {
  id: number;
  tone: ToastTone;
  title?: string;
  message: string;
  durationMs: number;
};

type ToastContextValue = {
  show: (toast: Omit<Toast, "id" | "durationMs"> & { durationMs?: number }) => number;
  success: (message: string, title?: string) => number;
  error: (message: string, title?: string) => number;
  info: (message: string, title?: string) => number;
  warning: (message: string, title?: string) => number;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_CLASSES: Record<ToastTone, string> = {
  info: "border-brand-navy/15 bg-white text-brand-ink dark:bg-brand-navySoft dark:text-brand-bone",
  success: "border-emerald-500/30 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  warning: "border-amber-500/30 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  error: "border-rose-500/30 bg-rose-50 text-rose-900 dark:bg-rose-950 dark:text-rose-100"
};

const TONE_DEFAULT_DURATION: Record<ToastTone, number> = {
  info: 4000,
  success: 4000,
  warning: 6000,
  error: 8000
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback<ToastContextValue["show"]>(
    (input) => {
      const id = nextId.current++;
      const tone: ToastTone = input.tone ?? "info";
      const durationMs = input.durationMs ?? TONE_DEFAULT_DURATION[tone];
      const toast: Toast = { id, tone, title: input.title, message: input.message, durationMs };
      setToasts((current) => [...current, toast]);
      if (durationMs > 0) {
        const timer = setTimeout(() => dismiss(id), durationMs);
        timers.current.set(id, timer);
      }
      return id;
    },
    [dismiss]
  );

  useEffect(() => {
    return () => {
      timers.current.forEach((timer) => clearTimeout(timer));
      timers.current.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      dismiss,
      success: (message, title) => show({ tone: "success", message, title }),
      error: (message, title) => show({ tone: "error", message, title }),
      info: (message, title) => show({ tone: "info", message, title }),
      warning: (message, title) => show({ tone: "warning", message, title })
    }),
    [show, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4 sm:top-6"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto w-full max-w-sm rounded-2xl border px-4 py-3 shadow-soft ${TONE_CLASSES[toast.tone]}`}
          >
            <div className="flex items-start gap-3">
              <div className="flex-1">
                {toast.title ? <p className="text-sm font-semibold">{toast.title}</p> : null}
                <p className="text-sm leading-snug opacity-90">{toast.message}</p>
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Fechar notificação"
                className="-mr-1 -mt-1 rounded-full p-1 text-current opacity-60 transition hover:opacity-100"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Allow the hook to be called outside the provider in degraded contexts (tests, isolated
    // storybook stories) — fall back to a no-op so the call doesn't crash the tree.
    return {
      show: () => 0,
      dismiss: () => undefined,
      success: () => 0,
      error: () => 0,
      info: () => 0,
      warning: () => 0
    };
  }
  return ctx;
}
