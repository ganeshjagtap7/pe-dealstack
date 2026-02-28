import React, { useEffect, useRef } from 'react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

const variantConfig = {
  danger: {
    icon: 'delete_forever',
    iconBg: '#FEE2E2',
    iconColor: '#DC2626',
    confirmBg: '#DC2626',
    confirmHoverBg: '#B91C1C',
  },
  warning: {
    icon: 'warning',
    iconBg: '#FEF3C7',
    iconColor: '#D97706',
    confirmBg: '#D97706',
    confirmHoverBg: '#B45309',
  },
  info: {
    icon: 'info',
    iconBg: '#E6EEF5',
    iconColor: '#003366',
    confirmBg: '#003366',
    confirmHoverBg: '#004488',
  },
};

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}) => {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const config = variantConfig[variant];

  // Focus the cancel button on open, trap Escape key
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
        style={{ animation: 'fadeIn 150ms ease-out' }}
      />

      {/* Dialog */}
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[400px] mx-4 overflow-hidden"
        style={{ animation: 'dialogSlideIn 200ms ease-out' }}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
      >
        {/* Content */}
        <div className="p-6 text-center">
          {/* Icon */}
          <div
            className="flex items-center justify-center w-14 h-14 rounded-2xl mx-auto mb-4"
            style={{ backgroundColor: config.iconBg }}
          >
            <span
              className="material-symbols-outlined text-3xl"
              style={{ color: config.iconColor }}
            >
              {config.icon}
            </span>
          </div>

          <h3
            id="confirm-dialog-title"
            className="text-lg font-semibold text-slate-900 mb-2"
          >
            {title}
          </h3>

          <p
            id="confirm-dialog-message"
            className="text-sm text-slate-500 leading-relaxed"
          >
            {message}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 px-6 pb-6">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white rounded-xl transition-colors shadow-lg"
            style={{ backgroundColor: config.confirmBg }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = config.confirmHoverBg)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = config.confirmBg)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>

      {/* Inline keyframes */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes dialogSlideIn {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
};
