import {
  AlertTriangle,
  Check,
  Info,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type ToastTone = "success" | "error" | "warning" | "info";

type ToastItem = {
  id: string;
  tone: ToastTone;
  title: string;
  message?: string;
};

type ToastInput = {
  tone?: ToastTone;
  title: string;
  message?: string;
  durationMs?: number;
};

type ToastContextValue = {
  push: (input: ToastInput) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_STYLES: Record<
  ToastTone,
  { icon: LucideIcon; border: string; iconWrap: string; iconColor: string }
> = {
  success: {
    icon: Check,
    border: "border-emerald-200",
    iconWrap: "bg-emerald-50",
    iconColor: "text-emerald-700",
  },
  error: {
    icon: XCircle,
    border: "border-red-200",
    iconWrap: "bg-red-50",
    iconColor: "text-red-700",
  },
  warning: {
    icon: AlertTriangle,
    border: "border-amber-200",
    iconWrap: "bg-amber-50",
    iconColor: "text-amber-700",
  },
  info: {
    icon: Info,
    border: "border-neutral-200",
    iconWrap: "bg-neutral-100",
    iconColor: "text-neutral-700",
  },
};

let toastSeq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const push = useCallback(
    (input: ToastInput) => {
      const id = `toast-${Date.now()}-${toastSeq++}`;
      const tone = input.tone ?? "info";
      const durationMs = input.durationMs ?? (tone === "error" ? 7000 : 4200);
      setItems((current) => [
        ...current.slice(-4),
        {
          id,
          tone,
          title: input.title,
          message: input.message,
        },
      ]);
      window.setTimeout(() => dismiss(id), durationMs);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      push,
      success: (title, message) => push({ tone: "success", title, message }),
      error: (title, message) => push({ tone: "error", title, message }),
      warning: (title, message) => push({ tone: "warning", title, message }),
      info: (title, message) => push({ tone: "info", title, message }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div
          className="pointer-events-none fixed right-4 bottom-4 z-[80] flex w-[min(100vw-2rem,22rem)] flex-col gap-2"
          aria-live="polite"
          aria-relevant="additions"
        >
          {items.map((item) => {
            const style = TONE_STYLES[item.tone];
            const Icon = style.icon;
            return (
              <div
                key={item.id}
                role="status"
                className={`pointer-events-auto flex items-start gap-3 rounded-sm border bg-white px-3.5 py-3 shadow-lg ${style.border}`}
              >
                <span
                  className={`mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-sm ${style.iconWrap} ${style.iconColor}`}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-neutral-950">{item.title}</p>
                  {item.message ? (
                    <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">
                      {item.message}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  aria-label="Dismiss"
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                  onClick={() => dismiss(item.id)}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) {
    throw new Error("useToast must be used within ToastProvider.");
  }
  return value;
}
