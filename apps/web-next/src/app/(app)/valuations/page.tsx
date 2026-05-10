"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, NotFoundError } from "@/lib/api";
import { useToast } from "@/providers/ToastProvider";
import { formatRelativeTime } from "@/lib/formatters";

interface ValuationListItem {
  id: string;
  name: string;
  type: string;
  moic: number;
  irr: number;
  equityInvested: number;
  holdYears: number;
  updatedAt: string;
  createdAt: string;
}

export default function ValuationsListPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [items, setItems] = useState<ValuationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{ items: ValuationListItem[] }>("/valuations");
        if (!cancelled) setItems(res.items || []);
      } catch (err) {
        if (!(err instanceof NotFoundError)) {
          showToast("Couldn't load your valuation models.", "error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  const onCreate = async () => {
    setCreating(true);
    try {
      const created = await api.post<{ id: string }>("/valuations", {});
      router.push(`/valuations/${created.id}`);
    } catch {
      showToast("Couldn't create a new model.", "error");
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            Valuation Models
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-text-primary">
            LBO scenarios you can edit and stress-test
          </h1>
          <p className="mt-3 max-w-3xl text-sm text-text-secondary">
            Build standalone leveraged buyout models with your own assumptions
            (entry multiple, debt %, growth, exit multiple). Edit cells directly
            or ask the AI analyst to stress-test scenarios.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          disabled={creating}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-60"
          style={{ backgroundColor: "#003366" }}
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          {creating ? "Creating…" : "New LBO Model"}
        </button>
      </header>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="size-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-white p-16 text-center">
          <span className="material-symbols-outlined text-[40px] text-text-secondary">calculate</span>
          <h2 className="mt-3 text-lg font-semibold text-text-primary">No models yet</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Create your first LBO model. Defaults are pre-populated so you can see numbers immediately.
          </p>
          <button
            type="button"
            onClick={onCreate}
            disabled={creating}
            className="mt-5 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
            style={{ backgroundColor: "#003366" }}
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            New LBO Model
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {items.map((m) => (
            <Link
              key={m.id}
              href={`/valuations/${m.id}`}
              className="group rounded-xl border border-border bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold text-text-primary">
                    {m.name}
                  </h3>
                  <p className="mt-0.5 text-xs uppercase tracking-wider text-text-secondary">
                    {m.type === "lbo" ? "LBO" : m.type} · {m.holdYears}y hold
                  </p>
                </div>
                <span className="material-symbols-outlined text-[20px] text-text-secondary transition-transform group-hover:translate-x-0.5">
                  arrow_forward
                </span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <Metric label="MOIC" value={`${m.moic.toFixed(2)}x`} highlight={m.moic >= 2} />
                <Metric label="IRR" value={`${(m.irr * 100).toFixed(1)}%`} highlight={m.irr >= 0.2} />
                <Metric label="Equity" value={`$${m.equityInvested.toFixed(1)}M`} />
              </div>
              <p className="mt-4 text-[11px] text-text-secondary">
                Updated {formatRelativeTime(m.updatedAt)}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
        {label}
      </p>
      <p
        className={`mt-0.5 text-base font-semibold ${highlight ? "" : "text-text-primary"}`}
        style={highlight ? { color: "#003366" } : undefined}
      >
        {value}
      </p>
    </div>
  );
}
