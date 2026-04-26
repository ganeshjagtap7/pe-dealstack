// ─── PE OS — Premium Notification System ─────────────────────
// Stacked slide-in toasts with progress timer bar and smooth dismiss.
// Supports 2-param (message, type) and 3-param (title, message, type).

(function () {
  const TOAST_DURATION = 4500;
  const TOAST_GAP = 12;
  const TOAST_TOP_OFFSET = 24;
  let toasts = [];

  // ── Inject animation styles once ──────────────────────
  if (!document.getElementById('pe-toast-styles')) {
    const style = document.createElement('style');
    style.id = 'pe-toast-styles';
    style.textContent = `
      @keyframes peToastIn {
        from { opacity: 0; transform: translateX(24px) scale(0.96); }
        to   { opacity: 1; transform: translateX(0) scale(1); }
      }
      @keyframes peToastOut {
        from { opacity: 1; transform: translateX(0) scale(1); }
        to   { opacity: 0; transform: translateX(24px) scale(0.96); }
      }
      @keyframes peToastProgress {
        from { width: 100%; }
        to   { width: 0%; }
      }
      .pe-toast {
        position: fixed; right: 24px; z-index: 9990;
        min-width: 340px; max-width: 420px;
        background: #fff; border: 1px solid #E5E7EB;
        border-radius: 10px; overflow: hidden;
        box-shadow: 0 8px 24px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06);
        animation: peToastIn 0.28s cubic-bezier(0.16, 1, 0.3, 1);
        transition: top 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s;
      }
      .pe-toast.removing {
        animation: peToastOut 0.22s ease-in forwards;
      }
      .pe-toast-body {
        display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px;
      }
      .pe-toast-icon {
        width: 34px; height: 34px; border-radius: 8px;
        display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      }
      .pe-toast-icon .material-symbols-outlined { font-size: 20px; }
      .pe-toast-content { flex: 1; min-width: 0; }
      .pe-toast-title { font-size: 13px; font-weight: 600; color: #111827; line-height: 1.3; }
      .pe-toast-message { font-size: 12px; color: #6B7280; line-height: 1.4; margin-top: 2px; }
      .pe-toast-close {
        background: none; border: none; cursor: pointer; padding: 2px;
        color: #9CA3AF; flex-shrink: 0; border-radius: 4px;
        transition: background 0.15s, color 0.15s;
        display: flex; align-items: center; justify-content: center;
      }
      .pe-toast-close:hover { background: #F3F4F6; color: #374151; }
      .pe-toast-close .material-symbols-outlined { font-size: 16px; }
      .pe-toast-progress {
        height: 3px; border-radius: 0 0 10px 10px;
      }
      .pe-toast-progress-bar {
        height: 100%; border-radius: 0 0 10px 10px;
        animation: peToastProgress linear forwards;
      }
    `;
    document.head.appendChild(style);
  }

  const TYPE_CONFIG = {
    info:    { icon: 'info',         iconColor: '#2563EB', iconBg: '#EFF6FF', progressColor: '#3B82F6' },
    success: { icon: 'check_circle', iconColor: '#059669', iconBg: '#ECFDF5', progressColor: '#10B981' },
    warning: { icon: 'warning',      iconColor: '#D97706', iconBg: '#FFFBEB', progressColor: '#F59E0B' },
    error:   { icon: 'error',        iconColor: '#DC2626', iconBg: '#FEF2F2', progressColor: '#EF4444' },
  };

  function repositionToasts() {
    let y = TOAST_TOP_OFFSET;
    toasts.forEach(t => {
      t.el.style.top = y + 'px';
      y += t.el.offsetHeight + TOAST_GAP;
    });
  }

  function removeToast(entry) {
    clearTimeout(entry.timer);
    entry.el.classList.add('removing');
    setTimeout(() => {
      entry.el.remove();
      toasts = toasts.filter(t => t !== entry);
      repositionToasts();
    }, 220);
  }

  function showNotification(titleOrMessage, messageOrType, maybeType) {
    // Parse flexible arguments
    let title, message, type;
    if (maybeType !== undefined) {
      title = titleOrMessage; message = messageOrType; type = maybeType;
    } else if (typeof messageOrType === 'string' && ['info','success','warning','error'].includes(messageOrType)) {
      title = null; message = titleOrMessage; type = messageOrType;
    } else if (messageOrType !== undefined) {
      title = titleOrMessage; message = messageOrType; type = 'info';
    } else {
      title = null; message = titleOrMessage; type = 'info';
    }

    const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.info;

    const el = document.createElement('div');
    el.className = 'pe-toast';

    const titleHtml = title ? `<div class="pe-toast-title">${escapeHtml(title)}</div>` : '';
    const messageHtml = `<div class="pe-toast-message">${escapeHtml(message)}</div>`;

    el.innerHTML = `
      <div class="pe-toast-body">
        <div class="pe-toast-icon" style="background:${cfg.iconBg}; color:${cfg.iconColor};">
          <span class="material-symbols-outlined">${cfg.icon}</span>
        </div>
        <div class="pe-toast-content">
          ${titleHtml}
          ${messageHtml}
        </div>
        <button class="pe-toast-close" aria-label="Dismiss">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div class="pe-toast-progress">
        <div class="pe-toast-progress-bar" style="background:${cfg.progressColor}; animation-duration:${TOAST_DURATION}ms;"></div>
      </div>
    `;

    document.body.appendChild(el);

    const entry = { el, timer: null };
    toasts.push(entry);
    repositionToasts();

    // Close button
    el.querySelector('.pe-toast-close').addEventListener('click', () => removeToast(entry));

    // Pause progress on hover
    const bar = el.querySelector('.pe-toast-progress-bar');
    el.addEventListener('mouseenter', () => {
      bar.style.animationPlayState = 'paused';
      clearTimeout(entry.timer);
    });
    el.addEventListener('mouseleave', () => {
      bar.style.animationPlayState = 'running';
      const remaining = (bar.offsetWidth / el.offsetWidth) * TOAST_DURATION;
      entry.timer = setTimeout(() => removeToast(entry), remaining);
    });

    // Auto-dismiss
    entry.timer = setTimeout(() => removeToast(entry), TOAST_DURATION);
  }

  function escapeHtml(str) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  window.showNotification = showNotification;
})();
