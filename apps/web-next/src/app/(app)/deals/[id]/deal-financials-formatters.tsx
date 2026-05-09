import { cn } from "@/lib/cn";
import { getCurrencySymbol } from "@/lib/formatters";

export function isPctKey(key: string): boolean {
  return key.endsWith("_pct") || key.endsWith("_margin");
}

export function fmtMoney(val: number | null | undefined, unitScale?: string, currency?: string): string {
  if (val === null || val === undefined) return "—";
  const n = Number(val);
  if (isNaN(n)) return "—";
  const sym = getCurrencySymbol(currency);
  const code = (currency || "USD").toUpperCase();
  if (code === "INR" && unitScale === "MILLIONS") {
    return sym + (n / 10).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "Cr";
  }
  if (code === "INR" && unitScale === "THOUSANDS") {
    return sym + (n / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "L";
  }
  const suffix = unitScale === "MILLIONS" ? "M" : unitScale === "THOUSANDS" ? "K" : "";
  return sym + n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + suffix;
}

export function fmtPct(val: number | null | undefined): string {
  if (val === null || val === undefined) return "—";
  const n = Number(val);
  if (isNaN(n)) return "—";
  return n.toFixed(1) + "%";
}

export function ConfidenceBadge({ confidence }: { confidence?: number | null }) {
  const pct = Math.round(confidence ?? 0);
  const [cls, dotColor] =
    pct >= 80 ? ["bg-emerald-50 text-emerald-700 border-emerald-200", "#059669"]
    : pct >= 50 ? ["bg-amber-50 text-amber-700 border-amber-200", "#d97706"]
    : ["bg-red-50 text-red-600 border-red-200", "#dc2626"];
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border", cls)}>
      <span className="inline-block rounded-full" style={{ width: 5, height: 5, background: dotColor }} />
      {pct}%
    </span>
  );
}
