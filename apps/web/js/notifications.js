// ─── PE OS — Centralized Notification System ────────────────
// Replaces 7 duplicate showNotification() implementations.
// Supports both 2-param (message, type) and 3-param (title, message, type) signatures.

(function () {
  let notificationStack = [];

  function showNotification(titleOrMessage, messageOrType, maybeType) {
    let title, message, type;

    if (maybeType !== undefined) {
      // 3-param: showNotification(title, message, type)
      title = titleOrMessage;
      message = messageOrType;
      type = maybeType;
    } else if (typeof messageOrType === 'string' && ['info', 'success', 'warning', 'error'].includes(messageOrType)) {
      // 2-param: showNotification(message, type)
      title = null;
      message = titleOrMessage;
      type = messageOrType;
    } else if (messageOrType !== undefined) {
      // 2-param but second is the message: showNotification(title, message)
      title = titleOrMessage;
      message = messageOrType;
      type = 'info';
    } else {
      // 1-param: showNotification(message)
      title = null;
      message = titleOrMessage;
      type = 'info';
    }

    var icons = {
      info: 'info',
      success: 'check_circle',
      warning: 'warning',
      error: 'error',
    };

    var colors = {
      info: 'text-blue-600 bg-blue-50',
      success: 'text-emerald-600 bg-emerald-50',
      warning: 'text-orange-600 bg-orange-50',
      error: 'text-red-600 bg-red-50',
    };

    var toast = document.createElement('div');
    var offset = 80 + notificationStack.length * 72;
    toast.className = 'fixed right-6 bg-white border border-slate-200 rounded-lg shadow-2xl p-4 z-50 min-w-[320px] max-w-[420px]';
    toast.style.top = offset + 'px';
    toast.style.transition = 'opacity 0.3s, transform 0.3s';
    toast.style.animation = 'slideInRight 0.3s ease-out';

    var titleHtml = title
      ? '<h4 class="font-semibold text-slate-900 text-sm">' + title + '</h4>'
      : '';
    var messageHtml = '<p class="text-xs text-slate-600' + (title ? ' mt-0.5' : '') + '">' + message + '</p>';

    toast.innerHTML =
      '<div class="flex items-start gap-3">' +
        '<div class="p-2 ' + (colors[type] || colors.info) + ' rounded-lg">' +
          '<span class="material-symbols-outlined text-[20px]">' + (icons[type] || icons.info) + '</span>' +
        '</div>' +
        '<div class="flex-1 min-w-0">' +
          titleHtml +
          messageHtml +
        '</div>' +
        '<button onclick="this.closest(\'.fixed\').remove()" class="text-slate-400 hover:text-slate-600 flex-shrink-0">' +
          '<span class="material-symbols-outlined text-[18px]">close</span>' +
        '</button>' +
      '</div>';

    document.body.appendChild(toast);
    notificationStack.push(toast);

    setTimeout(function () {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(20px)';
      setTimeout(function () {
        toast.remove();
        notificationStack = notificationStack.filter(function (t) { return t !== toast; });
      }, 300);
    }, 4000);
  }

  // Expose globally
  window.showNotification = showNotification;
})();
