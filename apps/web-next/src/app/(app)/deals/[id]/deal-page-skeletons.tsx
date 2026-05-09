"use client";

import Link from "next/link";
import { Skeleton } from "@/components/ui/Skeleton";

// ---------------------------------------------------------------------------
// Loading skeleton — full deal page placeholder shown while the deal is being
// fetched. Mirrors the two-column layout (header + left scroll panel + right
// chat panel) so the layout doesn't shift when real content arrives.
// ---------------------------------------------------------------------------

export function DealPageLoadingSkeleton() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header skeleton */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border-subtle px-6 bg-surface-card">
        <div className="flex items-center gap-3">
          <Skeleton width={28} height={28} rounded="md" />
          <Skeleton.Line width={60} height={14} />
          <Skeleton.Line width={140} height={14} />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton width={120} height={36} rounded="lg" />
          <Skeleton.Circle size={32} />
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel skeleton */}
        <section className="w-full lg:w-7/12 xl:w-1/2 flex flex-col overflow-y-auto border-r border-border-subtle bg-surface-card p-6 custom-scrollbar gap-4">
          {/* Deal header */}
          <div className="flex items-start gap-4">
            <Skeleton width={64} height={64} rounded="xl" />
            <div className="flex-1 flex flex-col gap-2">
              <Skeleton.Line width="55%" height={24} />
              <Skeleton.Line width="35%" height={13} />
              <div className="flex gap-2 mt-1">
                <Skeleton.Badge width={88} height={20} />
              </div>
            </div>
          </div>
          {/* Stage pipeline */}
          <div className="flex items-center gap-2 py-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} width="100%" height={28} rounded="md" className="flex-1" />
            ))}
          </div>
          {/* Metadata + financial rows */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white border border-border-subtle rounded-lg p-3 flex flex-col gap-2">
                <Skeleton.Line width="60%" height={10} />
                <Skeleton.Line width="80%" height={16} />
              </div>
            ))}
          </div>
          {/* Financial Statements / Analysis */}
          <div className="bg-white border border-border-subtle rounded-lg p-5 flex flex-col gap-3">
            <Skeleton.Line width="35%" height={16} />
            <Skeleton.Line width="100%" height={12} />
            <Skeleton.Line width="90%" height={12} />
            <Skeleton.Line width="75%" height={12} />
          </div>
          <div className="bg-white border border-border-subtle rounded-lg p-5 flex flex-col gap-3">
            <Skeleton.Line width="40%" height={16} />
            <Skeleton.Line width="100%" height={12} />
            <Skeleton.Line width="95%" height={12} />
            <Skeleton.Line width="80%" height={12} />
          </div>
          {/* Tabs */}
          <div className="flex items-center gap-4 border-b border-border-subtle pb-3">
            <Skeleton.Line width={70} height={14} />
            <Skeleton.Line width={80} height={14} />
            <Skeleton.Line width={60} height={14} />
          </div>
        </section>
        {/* Right panel skeleton */}
        <section className="hidden lg:flex flex-1 flex-col bg-background-body border-l border-border-subtle/60 p-6 gap-3" style={{ minWidth: 300 }}>
          <div className="flex items-center gap-2">
            <Skeleton.Circle size={28} />
            <Skeleton.Line width="40%" height={14} />
          </div>
          <div className="flex flex-col gap-3 mt-2">
            <Skeleton width="80%" height={48} rounded="lg" />
            <Skeleton width="65%" height={48} rounded="lg" className="self-end" />
            <Skeleton width="75%" height={48} rounded="lg" />
          </div>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error / not-found state — shown when the deal load fails or returns nothing.
// ---------------------------------------------------------------------------

export function DealPageErrorState({ error }: { error: string }) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center max-w-md">
        <span className="material-symbols-outlined text-4xl text-red-400">error</span>
        <h2 className="mt-3 text-lg font-semibold text-text-main">Deal not found</h2>
        <p className="mt-1 text-sm text-text-muted">
          {error || "Could not load this deal."}
        </p>
        <Link
          href="/deals"
          className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 text-sm font-medium text-white rounded-lg"
          style={{ backgroundColor: "#003366" }}
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          Back to Deals
        </Link>
      </div>
    </div>
  );
}
