"use client";

// Custom skip-confirmation modal. Legacy used browser confirm(); main
// replaced it with this styled modal in 5fa58c6.
export function SkipConfirmModal({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(17,24,39,0.45)", backdropFilter: "blur(4px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-9 h-9 rounded-lg bg-primary-light flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-[20px]">info</span>
            </div>
            <h3 className="text-[16px] font-bold text-text-main">Skip setup?</h3>
          </div>
          <p className="text-[13.5px] text-text-secondary leading-relaxed">
            You can always finish setting up later from the sidebar checklist on your dashboard.
          </p>
        </div>
        <div className="flex gap-2.5 justify-end px-6 py-4 bg-gray-50 border-t border-border-subtle">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-[13px] font-medium text-text-secondary bg-white border border-border-subtle rounded-lg hover:border-border-focus hover:text-text-main transition-colors"
          >
            Continue setup
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 text-[13px] font-semibold text-white rounded-lg hover:opacity-90 transition-colors"
            style={{ backgroundColor: "#003366" }}
          >
            Skip to dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
