"use client";

import { Skeleton } from "@/components/ui/Skeleton";
import { TABLE_HEADERS, TABLE_TH_CLS } from "./list-items";

// ─── Loading / Error / Empty states for contacts/page.tsx ───────────────────

export function ContactsGridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {Array.from({ length: 9 }).map((_, i) => (
        <article key={i} className="bg-surface-card rounded-lg border border-border-subtle p-5 flex flex-col gap-3">
          <div className="flex items-start gap-3.5">
            <Skeleton.Circle size={44} />
            <div className="flex-1 flex flex-col gap-2">
              <Skeleton.Line width="70%" height={15} />
              <Skeleton.Line width="50%" height={12} />
            </div>
            <Skeleton.Badge width={64} height={20} />
          </div>
          <div className="flex items-center gap-1.5">
            <Skeleton.Line width="60%" height={13} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Skeleton.Line width="80%" height={12} />
            <Skeleton.Line width="55%" height={12} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Skeleton.Badge width={48} height={18} />
            <Skeleton.Badge width={56} height={18} />
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-border-subtle">
            <Skeleton.Line width="40%" height={11} />
            <Skeleton.Badge width={36} height={16} />
          </div>
        </article>
      ))}
    </div>
  );
}

export function ContactsTableSkeleton() {
  return (
    <div className="bg-surface-card rounded-lg border border-border-subtle shadow-card overflow-hidden">
      <table className="w-full min-w-[600px]">
        <thead>
          <tr className="border-b border-border-subtle bg-slate-50/50">
            {TABLE_HEADERS.map((h) => <th key={h} className={TABLE_TH_CLS}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 8 }).map((_, i) => (
            <tr key={i} className="border-b border-border-subtle">
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <Skeleton.Circle size={32} />
                  <div className="flex-1 flex flex-col gap-1.5">
                    <Skeleton.Line width="70%" height={13} />
                    <Skeleton.Line width="50%" height={11} />
                  </div>
                </div>
              </td>
              <td className="px-4 py-3"><Skeleton.Line width="60%" height={13} /></td>
              <td className="px-4 py-3"><Skeleton.Badge width={56} /></td>
              <td className="px-4 py-3"><Skeleton.Line width="75%" height={13} /></td>
              <td className="px-4 py-3"><Skeleton.Line width="40%" height={13} /></td>
              <td className="px-4 py-3"><Skeleton.Badge width={36} height={16} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ContactsErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <span className="material-symbols-outlined text-red-500 text-4xl mb-4">error</span>
      <p className="text-text-main font-medium mb-2">Failed to load contacts</p>
      <p className="text-text-muted text-sm mb-4">{error}</p>
      <button onClick={onRetry} className="px-4 py-2 text-white rounded-lg text-sm font-medium hover:opacity-90 transition-colors" style={{ backgroundColor: "#003366" }}>Try Again</button>
    </div>
  );
}

export function ContactsEmptyState({ filtered, onAdd }: { filtered: boolean; onAdd: () => void }) {
  if (filtered) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <span className="material-symbols-outlined text-text-muted text-4xl mb-4">search_off</span>
        <p className="text-text-main font-medium mb-2">No contacts found</p>
        <p className="text-text-muted text-sm">Try adjusting your search or filters</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="size-16 rounded-full bg-blue-50/60 flex items-center justify-center mb-4">
        <span className="material-symbols-outlined text-[#003366] text-3xl">groups</span>
      </div>
      <h3 className="text-base font-bold text-text-main mb-2">Start building your network</h3>
      <p className="text-text-muted text-sm mb-5 text-center max-w-xs">Add contacts to track relationships with bankers, advisors, executives, and LPs.</p>
      <button onClick={onAdd} className="flex items-center gap-2 px-5 py-2 text-white rounded-lg shadow-sm hover:opacity-90 transition-colors text-sm font-medium" style={{ backgroundColor: "#003366" }}>
        <span className="material-symbols-outlined text-[18px]">person_add</span>Add Your First Contact
      </button>
    </div>
  );
}
