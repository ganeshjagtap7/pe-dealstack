"use client";

/**
 * Shared UI primitives scoped to /internal/usage.
 * Keep under 200 lines — do NOT promote to global components/ui/ yet.
 */

import { cn } from "@/lib/cn";

// ---------------------------------------------------------------------------
// Pill — a single styled pill button
// ---------------------------------------------------------------------------
interface PillProps {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export function Pill({ active, onClick, children, className, disabled }: PillProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap",
        active
          ? "text-white"
          : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50",
        disabled && "opacity-50 cursor-not-allowed",
        className,
      )}
      style={active ? { backgroundColor: "#003366", borderColor: "#003366" } : undefined}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// PillGroup — a row of mutually exclusive pill buttons
// ---------------------------------------------------------------------------
interface PillGroupOption<T extends string | number> {
  value: T;
  label: string;
}

interface PillGroupProps<T extends string | number> {
  options: PillGroupOption<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}

export function PillGroup<T extends string | number>({
  options,
  value,
  onChange,
  className,
}: PillGroupProps<T>) {
  return (
    <div className={cn("flex gap-1.5 flex-wrap", className)}>
      {options.map((opt) => (
        <Pill
          key={String(opt.value)}
          active={value === opt.value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </Pill>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatusPill — dot + label pattern for event/user status
// ---------------------------------------------------------------------------
type StatusVariant = "success" | "error" | "warning" | "neutral";

const STATUS_STYLES: Record<
  StatusVariant,
  { dot: string; text: string; bg: string }
> = {
  success: { dot: "bg-green-500", text: "text-green-700", bg: "bg-green-50" },
  error:   { dot: "bg-red-500",   text: "text-red-700",   bg: "bg-red-50"   },
  warning: { dot: "bg-amber-500", text: "text-amber-700", bg: "bg-amber-50" },
  neutral: { dot: "bg-gray-400",  text: "text-gray-600",  bg: "bg-gray-100" },
};

interface StatusPillProps {
  variant: StatusVariant;
  label: string;
  className?: string;
}

export function StatusPill({ variant, label, className }: StatusPillProps) {
  const s = STATUS_STYLES[variant];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
        s.bg,
        s.text,
        className,
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", s.dot)} />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// EmptyState — icon + heading + body + optional action
// ---------------------------------------------------------------------------
interface EmptyStateProps {
  heading: string;
  body: string;
  filtersActive?: boolean;
  onClearFilters?: () => void;
}

export function EmptyState({ heading, body, filtersActive, onClearFilters }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center gap-3">
      {/* Inbox / no-data icon */}
      <svg
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-gray-400"
        aria-hidden="true"
      >
        <path d="M22 12h-6l-2 3H10l-2-3H2" />
        <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
      </svg>
      <div>
        <p className="text-sm font-semibold text-gray-700">{heading}</p>
        <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">{body}</p>
      </div>
      {filtersActive && onClearFilters && (
        <button
          onClick={onClearFilters}
          className="text-xs font-medium hover:underline"
          style={{ color: "#003366" }}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ErrorPanel — small red-50 error block
// ---------------------------------------------------------------------------
interface ErrorPanelProps {
  message?: string;
}

export function ErrorPanel({ message = "Couldn't load data. Try refreshing." }: ErrorPanelProps) {
  return (
    <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KpiCard — single number + caption for the KPI strip
// ---------------------------------------------------------------------------
interface KpiCardProps {
  value: string;
  caption: string;
}

export function KpiCard({ value, caption }: KpiCardProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className="text-2xl font-bold tabular-nums tracking-tight"
        style={{ color: "#003366" }}
      >
        {value}
      </span>
      <span className="text-xs text-gray-500 uppercase tracking-wide">{caption}</span>
    </div>
  );
}
