// ─── PE OS — Shared Formatters ──────────────────────────────
// Centralizes formatting utilities used across multiple pages.
// Eliminates duplicates from deal.js, dashboard.js, memo-builder.js,
// crm.html, contacts.html, deal-intake.js, notificationCenter.js.

(function () {
  function formatFileSize(bytes) {
    if (!bytes) return 'N/A';
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return bytes + ' B';
  }

  function getDocIcon(name) {
    if (!name) return 'description';
    var ext = name.split('.').pop();
    if (ext) ext = ext.toLowerCase();
    if (ext === 'pdf') return 'picture_as_pdf';
    if (ext === 'xlsx' || ext === 'xls') return 'table_chart';
    if (ext === 'csv') return 'table_view';
    if (ext === 'msg' || ext === 'eml') return 'mail';
    if (ext === 'docx' || ext === 'doc') return 'article';
    if (ext === 'md') return 'summarize';
    if (name.startsWith('Deal Overview')) return 'summarize';
    return 'description';
  }

  function getDocColor(name) {
    if (!name) return 'slate';
    var ext = name.split('.').pop();
    if (ext) ext = ext.toLowerCase();
    if (ext === 'pdf') return 'red';
    if (ext === 'xlsx' || ext === 'xls') return 'emerald';
    if (ext === 'csv') return 'blue';
    if (ext === 'docx' || ext === 'doc') return 'indigo';
    if (ext === 'md') return 'purple';
    if (name.startsWith('Deal Overview')) return 'purple';
    return 'slate';
  }

  // Values are stored in millions USD in the database.
  // Displays in the most natural unit: B, M, K, or $
  function formatCurrency(value) {
    if (value === null || value === undefined) return 'N/A';
    var absValue = Math.abs(value);
    var sign = value < 0 ? '-' : '';
    if (absValue >= 1000) {
      var b = absValue / 1000;
      return sign + '$' + (b >= 100 ? b.toFixed(0) : b >= 10 ? b.toFixed(1) : b.toFixed(2)) + 'B';
    }
    if (absValue >= 1) {
      return sign + '$' + (absValue >= 100 ? absValue.toFixed(0) : absValue >= 10 ? absValue.toFixed(1) : absValue.toFixed(2)) + 'M';
    }
    var k = absValue * 1000;
    if (k >= 1) {
      return sign + '$' + (k >= 100 ? k.toFixed(0) : k >= 10 ? k.toFixed(1) : k.toFixed(2)) + 'K';
    }
    var dollars = absValue * 1000000;
    return sign + '$' + dollars.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  // Formats a raw number for display (e.g. in financial tables)
  function formatNumber(value, decimals) {
    if (value === null || value === undefined) return 'N/A';
    if (typeof decimals !== 'number') decimals = 1;
    return Number(value).toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  function formatRelativeTime(dateString) {
    if (!dateString) return 'N/A';
    var date = new Date(dateString);
    var now = new Date();
    var diff = now - date;
    var seconds = Math.floor(diff / 1000);
    var minutes = Math.floor(seconds / 60);
    var hours = Math.floor(minutes / 60);
    var days = Math.floor(hours / 24);
    if (days > 30) return date.toLocaleDateString();
    if (days > 0) return days + (days === 1 ? ' day ago' : ' days ago');
    if (hours > 0) return hours + (hours === 1 ? ' hour ago' : ' hours ago');
    if (minutes > 0) return minutes + (minutes === 1 ? ' min ago' : ' mins ago');
    return 'Just now';
  }

  // Aliases — some files use timeAgo() or formatTimeAgo()
  var formatTimeAgo = formatRelativeTime;
  var timeAgo = formatRelativeTime;

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Expose globally — both namespaced and bare for backward compatibility
  window.PEFormatters = {
    formatFileSize: formatFileSize,
    getDocIcon: getDocIcon,
    getDocColor: getDocColor,
    formatCurrency: formatCurrency,
    formatNumber: formatNumber,
    formatRelativeTime: formatRelativeTime,
    formatTimeAgo: formatTimeAgo,
    escapeHtml: escapeHtml,
  };

  // Bare globals for backward compat (existing code calls formatCurrency() directly)
  window.formatFileSize = formatFileSize;
  window.getDocIcon = getDocIcon;
  window.getDocColor = getDocColor;
  window.formatCurrency = formatCurrency;
  window.formatNumber = formatNumber;
  window.formatRelativeTime = formatRelativeTime;
  window.formatTimeAgo = formatTimeAgo;
  window.timeAgo = timeAgo;
  window.escapeHtml = escapeHtml;
})();
