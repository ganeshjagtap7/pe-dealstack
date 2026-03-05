/**
 * financials-merge.js — Merge/conflict resolution for Financial Statements
 * Extracted from financials.js. Loaded before financials.js.
 * Uses: finState, LINE_ITEM_LABELS, isPctKey, fmtPct, fmtMoney, confidenceBadge,
 *       escapeHtml (from formatters.js), PEAuth, API_BASE_URL, state, showNotification,
 *       loadFinancials, renderFinancialSection
 */

/* global finState, LINE_ITEM_LABELS, isPctKey, fmtPct, fmtMoney, confidenceBadge,
          escapeHtml, PEAuth, API_BASE_URL, state, showNotification, loadFinancials,
          renderFinancialSection */

// ─── Merge View Modal ─────────────────────────────────────────

function openMergeView() {
  renderMergeModal();
}

function closeMergeView() {
  document.getElementById('fin-merge-modal')?.remove();
}

function renderMergeModal() {
  document.getElementById('fin-merge-modal')?.remove();

  if (finState.conflicts.length === 0) return;

  const typeLabels = { INCOME_STATEMENT: 'Income Statement', BALANCE_SHEET: 'Balance Sheet', CASH_FLOW: 'Cash Flow' };

  const conflictsHtml = finState.conflicts.map(conflict => {
    const versions = conflict.versions;

    // Collect all line item keys across versions
    const allKeys = new Set();
    versions.forEach(v => Object.keys(v.lineItems ?? {}).forEach(k => allKeys.add(k)));

    // Build comparison rows
    const comparisonRows = [...allKeys].map(key => {
      const label = LINE_ITEM_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const isPct = isPctKey(key);

      const values = versions.map(v => v.lineItems?.[key] ?? null);
      const allSame = values.every(v => v === values[0]);
      const rowBg = allSame ? '' : 'background:rgba(234,179,8,0.08);';

      const cells = versions.map(v => {
        const val = v.lineItems?.[key];
        const display = isPct ? fmtPct(val) : fmtMoney(val, 'MILLIONS');
        return `<td class="px-3 py-1.5 text-right text-xs text-gray-700">${escapeHtml(display)}</td>`;
      }).join('');

      return `<tr style="${rowBg}" class="border-b border-gray-100">
        <td class="px-3 py-1.5 text-xs text-gray-500 font-medium">${escapeHtml(label)}</td>
        ${cells}
      </tr>`;
    }).join('');

    // Version headers
    const versionHeaders = versions.map(v => `
      <th class="px-3 py-2 text-center min-w-[140px]" style="background:#fafbfc;">
        <div class="text-[10px] font-semibold text-gray-700 truncate max-w-[130px]" title="${escapeHtml(v.documentName)}">${escapeHtml(v.documentName)}</div>
        <div class="mt-1">${confidenceBadge(v.extractionConfidence)}</div>
        <div class="text-[9px] text-gray-400 mt-0.5">${escapeHtml(v.extractionSource ?? '')}</div>
        ${v.isActive ? '<div class="text-[9px] font-semibold text-green-600 mt-0.5">ACTIVE</div>' : ''}
      </th>`).join('');

    // Action buttons
    const actionButtons = versions.map(v => `
      <td class="px-3 py-2 text-center">
        <button onclick="resolveConflict('${escapeHtml(conflict.statementType)}', '${escapeHtml(conflict.period)}', '${v.id}')"
          class="px-3 py-1 text-[10px] font-semibold rounded-md transition-colors ${v.isActive
            ? 'bg-green-50 text-green-700 border border-green-300'
            : 'text-gray-600 border border-gray-200 hover:border-blue-400 hover:text-blue-700 hover:bg-blue-50'}"
        >${v.isActive ? 'Currently Active' : 'Use This Version'}</button>
      </td>`).join('');

    const typeLabel = typeLabels[conflict.statementType] ?? conflict.statementType;

    return `
      <div class="mb-6 rounded-lg border border-gray-200 overflow-hidden" style="box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <div class="px-4 py-2.5 flex items-center gap-2" style="background:#003366;">
          <span class="material-symbols-outlined text-white text-sm">compare_arrows</span>
          <span class="text-xs font-bold text-white">${escapeHtml(typeLabel)} — ${escapeHtml(conflict.period)}</span>
          <span class="text-[10px] text-blue-200 ml-auto">${versions.length} versions</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-xs" style="border-collapse:separate;border-spacing:0;">
            <thead>
              <tr>
                <th class="px-3 py-2 text-left text-[10px] font-semibold text-gray-500" style="background:#fafbfc;min-width:140px;">Line Item</th>
                ${versionHeaders}
              </tr>
            </thead>
            <tbody>
              ${comparisonRows}
              <tr class="border-t-2 border-gray-200" style="background:#fafbfc;">
                <td class="px-3 py-2 text-xs font-semibold text-gray-700">Action</td>
                ${actionButtons}
              </tr>
            </tbody>
          </table>
        </div>
      </div>`;
  }).join('');

  const modal = document.createElement('div');
  modal.id = 'fin-merge-modal';
  modal.className = 'fixed inset-0 z-[9999] flex items-center justify-center';
  modal.style.background = 'rgba(0,0,0,0.5)';

  modal.innerHTML = `
    <div class="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col" style="box-shadow:0 20px 60px rgba(0,0,0,0.2);">
      <div class="flex items-center gap-3 px-6 py-4 border-b border-gray-200" style="background:linear-gradient(135deg,#003366,#004080);">
        <span class="material-symbols-outlined text-white text-xl">merge_type</span>
        <div>
          <h2 class="text-sm font-bold text-white">Multi-Document Merge View</h2>
          <p class="text-[10px] text-blue-200 mt-0.5">${finState.conflicts.length} overlapping period${finState.conflicts.length > 1 ? 's' : ''} need review</p>
        </div>
        <button onclick="closeMergeView()" class="ml-auto text-white/70 hover:text-white transition-colors">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div class="overflow-y-auto p-6 flex-1">
        ${conflictsHtml}
      </div>
      <div class="px-6 py-3 border-t border-gray-200 flex items-center gap-3 bg-gray-50 flex-wrap">
        <button onclick="resolveAllConflicts('highest_confidence')"
          class="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-lg transition-colors"
          style="background:#003366;">
          <span class="material-symbols-outlined text-sm">auto_fix_high</span>
          Auto-resolve All (Highest Confidence)
        </button>
        <button onclick="resolveAllConflicts('latest_document')"
          class="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors">
          <span class="material-symbols-outlined text-sm">schedule</span>
          Use Latest Document
        </button>
        <button onclick="closeMergeView()"
          class="ml-auto px-4 py-2 text-xs text-gray-500 hover:text-gray-800 transition-colors">
          Close
        </button>
      </div>
    </div>`;

  document.body.appendChild(modal);

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeMergeView();
  });
}

// ─── Conflict resolution handlers ─────────────────────────────

async function resolveConflict(statementType, period, versionId) {
  try {
    const res = await PEAuth.authFetch(`${API_BASE_URL}/deals/${state.dealId}/financials/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statementType, period, chosenVersionId: versionId }),
    });
    if (!res.ok) throw new Error('Failed to resolve');

    const typeLabel = { INCOME_STATEMENT: 'Income Statement', BALANCE_SHEET: 'Balance Sheet', CASH_FLOW: 'Cash Flow' }[statementType] ?? statementType;
    showNotification('Resolved', `${period} ${typeLabel} resolved`, 'success');
    await loadFinancials(state.dealId);

    // Re-render merge modal if conflicts remain
    if (finState.conflicts.length > 0) {
      renderMergeModal();
    } else {
      closeMergeView();
    }
  } catch (err) {
    showNotification('Error', 'Could not resolve conflict', 'error');
  }
}

async function resolveAllConflicts(strategy) {
  try {
    const res = await PEAuth.authFetch(`${API_BASE_URL}/deals/${state.dealId}/financials/resolve-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategy }),
    });
    if (!res.ok) throw new Error('Failed');
    const result = await res.json();

    const label = strategy === 'latest_document' ? 'latest document' : 'highest confidence';
    showNotification('All Resolved', `${result.resolved} conflict${result.resolved !== 1 ? 's' : ''} resolved using ${label}`, 'success');
    await loadFinancials(state.dealId);
    closeMergeView();
  } catch (err) {
    showNotification('Error', 'Could not auto-resolve conflicts', 'error');
  }
}
