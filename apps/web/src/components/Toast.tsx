import React, { useEffect } from 'react';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastMessage {
  id: string;
  message: string;
  variant: ToastVariant;
  duration?: number;
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

const variantStyles: Record<ToastVariant, { icon: string; iconColor: string; borderColor: string; bg: string }> = {
  success: {
    icon: 'check_circle',
    iconColor: '#16A34A',
    borderColor: '#BBF7D0',
    bg: '#F0FDF4',
  },
  error: {
    icon: 'error',
    iconColor: '#DC2626',
    borderColor: '#FECACA',
    bg: '#FEF2F2',
  },
  warning: {
    icon: 'warning',
    iconColor: '#D97706',
    borderColor: '#FDE68A',
    bg: '#FFFBEB',
  },
  info: {
    icon: 'info',
    iconColor: '#003366',
    borderColor: '#BFDBFE',
    bg: '#EFF6FF',
  },
};

const ToastItem: React.FC<{ toast: ToastMessage; onDismiss: (id: string) => void }> = ({ toast, onDismiss }) => {
  const style = variantStyles[toast.variant];

  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, toast.duration || 4000);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onDismiss]);

  return (
    <div
      className="relative flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border max-w-sm overflow-hidden"
      style={{
        backgroundColor: style.bg,
        borderColor: style.borderColor,
        animation: 'toastSlideIn 250ms ease-out',
      }}
      role="alert"
    >
      <span
        className="material-symbols-outlined text-xl shrink-0"
        style={{ color: style.iconColor }}
      >
        {style.icon}
      </span>
      <p className="text-sm text-slate-800 flex-1">{toast.message}</p>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-slate-400 hover:text-slate-600 transition-colors shrink-0"
      >
        <span className="material-symbols-outlined text-lg">close</span>
      </button>

      {/* Progress bar */}
      <div
        className="absolute bottom-0 left-0 h-0.5 rounded-b-xl"
        style={{
          backgroundColor: style.iconColor,
          animation: `toastProgress ${toast.duration || 4000}ms linear forwards`,
        }}
      />
    </div>
  );
};

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9998] flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}

      <style>{`
        @keyframes toastSlideIn {
          from { opacity: 0; transform: translateY(12px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes toastProgress {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
};
