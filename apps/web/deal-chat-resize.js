// ─── Deal Chat Panel — Resizable ────────────────────────────
// Drag the border between deal details and chat to resize.
// Persists width preference in localStorage.

(function () {
  const STORAGE_KEY = 'pe-deal-chat-width';
  const MIN_LEFT = 400;
  const MIN_RIGHT = 300;

  const handle = document.getElementById('chat-resize-handle');
  const leftPanel = document.getElementById('deal-left-panel');
  const rightPanel = document.getElementById('deal-right-panel');
  if (!handle || !leftPanel || !rightPanel) return;

  let isDragging = false;
  let startX = 0;
  let startLeftWidth = 0;

  function getMainWidth() {
    return leftPanel.parentElement.getBoundingClientRect().width;
  }

  function applyWidth(leftWidth) {
    const mainWidth = getMainWidth();
    const handleWidth = handle.getBoundingClientRect().width;
    const maxLeft = mainWidth - MIN_RIGHT - handleWidth;
    const clamped = Math.max(MIN_LEFT, Math.min(leftWidth, maxLeft));

    leftPanel.style.flexBasis = clamped + 'px';
    leftPanel.style.flexGrow = '0';
    leftPanel.style.flexShrink = '0';
    leftPanel.style.maxWidth = clamped + 'px';
  }

  // Restore saved width
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && window.innerWidth >= 1024) {
    applyWidth(parseInt(saved, 10));
  }

  handle.addEventListener('mousedown', function (e) {
    e.preventDefault();
    isDragging = true;
    startX = e.clientX;
    startLeftWidth = leftPanel.getBoundingClientRect().width;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    handle.style.backgroundColor = 'rgba(0, 51, 102, 0.15)';
  });

  document.addEventListener('mousemove', function (e) {
    if (!isDragging) return;
    const delta = e.clientX - startX;
    const newWidth = startLeftWidth + delta;
    applyWidth(newWidth);
  });

  document.addEventListener('mouseup', function () {
    if (!isDragging) return;
    isDragging = false;
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    handle.style.backgroundColor = '';
    const currentWidth = leftPanel.getBoundingClientRect().width;
    localStorage.setItem(STORAGE_KEY, Math.round(currentWidth).toString());
  });

  // Touch support
  handle.addEventListener('touchstart', function (e) {
    const touch = e.touches[0];
    isDragging = true;
    startX = touch.clientX;
    startLeftWidth = leftPanel.getBoundingClientRect().width;
    document.body.style.userSelect = 'none';
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (!isDragging) return;
    const touch = e.touches[0];
    const delta = touch.clientX - startX;
    applyWidth(startLeftWidth + delta);
  }, { passive: true });

  document.addEventListener('touchend', function () {
    if (!isDragging) return;
    isDragging = false;
    document.body.style.userSelect = '';
    const currentWidth = leftPanel.getBoundingClientRect().width;
    localStorage.setItem(STORAGE_KEY, Math.round(currentWidth).toString());
  });

  // Reset on double-click (remove custom width, revert to CSS defaults)
  handle.addEventListener('dblclick', function () {
    leftPanel.style.flexBasis = '';
    leftPanel.style.flexGrow = '';
    leftPanel.style.flexShrink = '';
    leftPanel.style.maxWidth = '';
    localStorage.removeItem(STORAGE_KEY);
  });
})();
