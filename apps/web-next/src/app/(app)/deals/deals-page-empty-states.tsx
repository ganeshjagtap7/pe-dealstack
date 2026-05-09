"use client";

// ---------------------------------------------------------------------------
// Empty / error state JSX for the deals page.
// Extracted from deals/page.tsx for file-size budget.
// ---------------------------------------------------------------------------

export function ErrorState({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <span className="material-symbols-outlined text-red-500 text-4xl mb-4">error</span>
      <p className="text-text-main font-medium mb-2">Failed to load deals</p>
      <p className="text-text-muted text-sm mb-4">{error}</p>
      <button
        onClick={onRetry}
        className="px-4 py-2 text-white rounded-lg text-sm font-medium hover:opacity-90 transition-colors"
        style={{ backgroundColor: "#003366" }}
      >
        Try Again
      </button>
    </div>
  );
}

export function NoMatchingDealsState() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <span className="material-symbols-outlined text-text-muted text-4xl mb-4">search_off</span>
      <p className="text-text-main font-medium mb-2">No deals found</p>
      <p className="text-text-muted text-sm">Try adjusting your filters</p>
    </div>
  );
}

export function WelcomeEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24">
      <div className="w-20 h-20 rounded-2xl bg-primary-light border border-primary/10 flex items-center justify-center mb-6 shadow-sm">
        <span className="material-symbols-outlined text-primary" style={{ fontSize: "36px" }}>
          rocket_launch
        </span>
      </div>
      <p className="text-text-main font-bold text-xl mb-2 tracking-tight">Welcome to Your Deal Pipeline</p>
      <p className="text-text-muted text-sm text-center max-w-md mb-8 leading-relaxed">
        Start building your deal flow. Create your first deal or import from a spreadsheet to track through sourcing, due diligence, and close.
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-white rounded-lg shadow-sm hover:opacity-90 transition-colors text-sm font-semibold"
          style={{ backgroundColor: "#003366" }}
        >
          <span className="material-symbols-outlined text-[18px]">add_circle</span>
          Create Your First Deal
        </button>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold border border-border-subtle text-text-secondary hover:border-primary/30 hover:text-primary transition-all"
        >
          <span className="material-symbols-outlined text-[18px]">upload_file</span>
          Import Deals
        </button>
      </div>
    </div>
  );
}
