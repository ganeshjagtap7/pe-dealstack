"use client";

// ---------------------------------------------------------------------------
// Upload Card (shown at end of deals grid)
// ---------------------------------------------------------------------------
export function UploadCard({ onClick }: { onClick?: () => void }) {
  return (
    <article
      onClick={onClick}
      className="bg-surface-card/50 rounded-lg border-2 border-dashed border-border-subtle p-5 hover:border-primary hover:bg-primary-light/30 transition-all cursor-pointer group flex flex-col items-center justify-center h-full min-h-[320px] text-center gap-4"
    >
      <div className="size-14 rounded-full bg-surface-card border border-border-subtle flex items-center justify-center group-hover:scale-110 group-hover:border-primary/30 transition-all shadow-sm">
        <span className="material-symbols-outlined text-text-muted group-hover:text-primary text-2xl">add</span>
      </div>
      <div>
        <h3 className="text-text-main font-bold text-base group-hover:text-primary transition-colors">
          Upload Documents
        </h3>
        <p className="text-text-muted text-sm mt-1 max-w-[180px]">
          Drop CIMs, Teasers, or Excel models
        </p>
      </div>
    </article>
  );
}
