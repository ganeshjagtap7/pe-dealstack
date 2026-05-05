(async function() {
  const API = window.API_BASE_URL || '/api';

  function formatOperationName(op) {
    return String(op).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  async function loadUsage() {
    try {
      const res = await PEAuth.authFetch(`${API}/usage/me`).then(r => r.json());
      if (!res || res.error) return;

      const totalEl = document.getElementById('ai-usage-total');
      const barFillEl = document.getElementById('ai-usage-bar-fill');
      const breakdownTable = document.getElementById('ai-usage-breakdown');
      const breakdownBody = document.getElementById('ai-usage-breakdown-body');
      const emptyEl = document.getElementById('ai-usage-empty');
      if (!totalEl) return;

      const total = Number(res.totalCredits ?? 0);
      totalEl.textContent = total.toLocaleString();

      // Visual reference: cap bar at 1000 credits as a soft hint, no enforced limit
      const fillPct = Math.min(100, (total / 1000) * 100);
      if (barFillEl) barFillEl.style.width = fillPct + '%';

      const breakdown = res.breakdown || [];
      if (breakdown.length === 0) {
        breakdownTable.hidden = true;
        emptyEl.hidden = false;
      } else {
        breakdownTable.hidden = false;
        emptyEl.hidden = true;
        breakdownBody.innerHTML = breakdown.map(b => `
          <tr class="border-b border-border-subtle/50">
            <td class="py-2">${escapeHtml(formatOperationName(b.operation))}</td>
            <td class="py-2 text-right">${b.count}</td>
            <td class="py-2 text-right">${b.credits}</td>
          </tr>
        `).join('');
      }
    } catch (err) {
      console.warn('Failed to load AI usage', err);
    }
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Wait for DOM + PEAuth to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadUsage);
  } else {
    loadUsage();
  }
})();
