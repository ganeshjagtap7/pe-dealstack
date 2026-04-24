"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToastType = "info" | "success" | "warning" | "error";

export interface ToastOptions {
  /** Optional title shown above the message. */
  title?: string;
  /** Duration in ms before auto-dismiss. Default 4500. */
  duration?: number;
}

interface ToastEntry {
  id: number;
  type: ToastType;
  title?: string;
  message: string;
  duration: number;
  removing: boolean;
}

interface ToastContextType {
  /** Show a toast notification.
   *  @example showToast("Saved!", "success")
   *  @example showToast("Oops", "error", { title: "Upload failed" })
   */
  showToast: (message: string, type?: ToastType, options?: ToastOptions) => void;
}

// ---------------------------------------------------------------------------
// Config — matches legacy notifications.js exactly
// ---------------------------------------------------------------------------

const TOAST_DURATION = 4500;

const TYPE_CONFIG: Record<
  ToastType,
  { icon: string; iconColor: string; iconBg: string; progressColor: string }
> = {
  info:    { icon: "info",         iconColor: "#2563EB", iconBg: "#EFF6FF", progressColor: "#3B82F6" },
  success: { icon: "check_circle", iconColor: "#059669", iconBg: "#ECFDF5", progressColor: "#10B981" },
  warning: { icon: "warning",      iconColor: "#D97706", iconBg: "#FFFBEB", progressColor: "#F59E0B" },
  error:   { icon: "error",        iconColor: "#DC2626", iconBg: "#FEF2F2", progressColor: "#EF4444" },
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ToastContext = createContext<ToastContextType>({
  showToast: () => {},
});

// ---------------------------------------------------------------------------
// Individual Toast component
// ---------------------------------------------------------------------------

function Toast({
  entry,
  onRemove,
}: {
  entry: ToastEntry;
  onRemove: (id: number) => void;
}) {
  const cfg = TYPE_CONFIG[entry.type] || TYPE_CONFIG.info;
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const remainingRef = useRef(entry.duration);
  const startRef = useRef(Date.now());

  // Start / resume auto-dismiss timer
  const startTimer = useCallback(() => {
    startRef.current = Date.now();
    timerRef.current = setTimeout(() => onRemove(entry.id), remainingRef.current);
  }, [entry.id, onRemove]);

  // Initial timer
  useEffect(() => {
    startTimer();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMouseEnter = () => {
    setPaused(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    remainingRef.current -= Date.now() - startRef.current;
    if (remainingRef.current < 0) remainingRef.current = 0;
  };

  const handleMouseLeave = () => {
    setPaused(false);
    startTimer();
  };

  return (
    <div
      className={cn(
        "pe-toast",
        entry.removing && "pe-toast-removing",
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Body */}
      <div className="flex items-start gap-3 px-4 py-3.5">
        {/* Icon */}
        <div
          className="w-[34px] h-[34px] rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: cfg.iconBg, color: cfg.iconColor }}
        >
          <span className="material-symbols-outlined text-[20px]">{cfg.icon}</span>
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          {entry.title && (
            <p className="text-[13px] font-semibold text-text-main leading-snug">
              {entry.title}
            </p>
          )}
          <p className="text-xs text-text-secondary leading-relaxed mt-0.5">
            {entry.message}
          </p>
        </div>

        {/* Close */}
        <button
          type="button"
          onClick={() => onRemove(entry.id)}
          className="p-0.5 rounded text-text-muted hover:bg-gray-100 hover:text-text-secondary transition-colors shrink-0 flex items-center justify-center"
          aria-label="Dismiss"
        >
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-[3px]">
        <div
          className="h-full pe-toast-progress-bar"
          style={{
            backgroundColor: cfg.progressColor,
            animationDuration: `${entry.duration}ms`,
            animationPlayState: paused ? "paused" : "running",
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const showToast = useCallback(
    (message: string, type: ToastType = "info", options?: ToastOptions) => {
      const id = nextId++;
      const entry: ToastEntry = {
        id,
        type,
        title: options?.title,
        message,
        duration: options?.duration ?? TOAST_DURATION,
        removing: false,
      };
      setToasts((prev) => [...prev, entry]);
    },
    [],
  );

  const removeToast = useCallback((id: number) => {
    // Mark as removing so the exit animation plays
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, removing: true } : t)),
    );
    // After exit animation completes, actually remove
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 220);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* Toast container — fixed top-right, stacked */}
      {toasts.length > 0 && (
        <div
          className="fixed top-6 right-6 z-[9990] flex flex-col gap-3 pointer-events-none"
          aria-live="polite"
          aria-atomic="false"
        >
          {toasts.map((entry) => (
            <div key={entry.id} className="pointer-events-auto">
              <Toast entry={entry} onRemove={removeToast} />
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
