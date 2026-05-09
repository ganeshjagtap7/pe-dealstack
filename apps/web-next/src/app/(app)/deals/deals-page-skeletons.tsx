"use client";

import { Skeleton } from "@/components/ui/Skeleton";

// ---------------------------------------------------------------------------
// Loading skeletons for the deals list / kanban views.
// Extracted from deals/page.tsx for file-size budget.
// ---------------------------------------------------------------------------

export function KanbanSkeleton() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="min-w-[300px] w-[300px] shrink-0">
          <div className="bg-surface-card rounded-xl border border-border-subtle overflow-hidden h-full flex flex-col">
            <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
              <Skeleton.Badge width={80} />
              <Skeleton width={24} height={18} rounded="full" />
            </div>
            <div className="flex-1 p-3 space-y-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="bg-white rounded-lg border border-border-subtle p-3 flex flex-col gap-2">
                  <Skeleton.Line width="80%" height={14} />
                  <Skeleton.Line width="55%" height={12} />
                  <div className="flex items-center gap-2 pt-1">
                    <Skeleton.Badge width={56} height={16} />
                    <Skeleton.Line width={40} height={12} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-5 pb-6">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="bg-surface-card rounded-lg border border-border-subtle p-5 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 flex flex-col gap-2">
              <Skeleton.Line width="70%" height={16} />
              <Skeleton.Line width="45%" height={12} />
            </div>
            <Skeleton.Badge width={70} height={20} />
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="flex flex-col gap-1.5">
              <Skeleton.Line width="50%" height={10} />
              <Skeleton.Line width="80%" height={14} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Skeleton.Line width="50%" height={10} />
              <Skeleton.Line width="80%" height={14} />
            </div>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-border-subtle">
            <Skeleton.Line width="40%" height={11} />
            <div className="flex items-center -space-x-1.5">
              <Skeleton.Circle size={24} />
              <Skeleton.Circle size={24} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
