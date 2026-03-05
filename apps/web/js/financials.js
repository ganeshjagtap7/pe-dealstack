/**
 * financials.js — Financial Dashboard for Deal Detail Page
 * Loaded after financials-helpers.js and deal.js.
 * Constants (LINE_ITEM_LABELS, SUBTOTAL_KEYS) and helpers (fmtMoney, fmtPct, isPctKey,
 * confidenceBadge, periodTypeClass, renderFinStatusBadge, openFinancialsPanel,
 * showConfidencePopup) are in financials-helpers.js.
 */

// ─── State ────────────────────────────────────────────────────
const finState = {
  statements: [],      // raw rows from GET /financials (each has Document: {id, name})
  validation: null,    // result from GET /financials/validation
  conflicts: [],       // from GET /financials/conflicts — overlapping period versions
  activeTab: 'INCOME_STATEMENT',
  extracting: false,
  chartVisible: false,
  chartType: 'revenue',  // 'revenue' | 'growth' (IS tab) | 'composition' (BS tab)
  chartInstance: null,   // Chart.js instance
};

// ─── Main entry point ─────────────────────────────────────────
async function loadFinancials(dealId) {
  try {
    const [stmtsRes, validRes, conflictsRes] = await Promise.all([
      PEAuth.authFetch(`${API_BASE_URL}/deals/${dealId}/financials`),
      PEAuth.authFetch(`${API_BASE_URL}/deals/${dealId}/financials/validation`),
      PEAuth.authFetch(`${API_BASE_URL}/deals/${dealId}/financials/conflicts`),
    ]);

    if (stmtsRes.ok) finState.statements = await stmtsRes.json();
    if (validRes.ok) finState.validation = await validRes.json();
    if (conflictsRes.ok) {
      const conflictData = await conflictsRes.json();
      finState.conflicts = conflictData.conflicts ?? [];
    }
  } catch (err) {
    console.warn('[financials] load error', err);
  }

  renderFinancialSection();
  renderFinStatusBadge();
}

// ─── Render the full section ───────────────────────────────────
function renderFinancialSection() {
  const container = document.getElementById('financials-content');
  if (!container) return;

  const hasData = finState.statements.length > 0;

  // Validation flag banner — collapsible, premium amber styling
  const flags = finState.validation?.checks ?? [];
  const flagHtml = flags.length > 0 ? `
    <div class="mb-4 rounded-lg border border-amber-200 bg-amber-50 overflow-hidden">
      <button onclick="var el=document.getElementById('fin-flags-list');el.style.display=el.style.display==='none'?'block':'none';this.querySelector('.fin-flag-chevron').style.transform=el.style.display==='none'?'':'rotate(180deg)';"
        class="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-amber-100/50 transition-colors">
        <span class="material-symbols-outlined text-amber-500 text-base">warning</span>
        <span class="text-xs font-semibold text-amber-800">${flags.length} Validation Flag${flags.length > 1 ? 's' : ''}</span>
        <span class="material-symbols-outlined fin-flag-chevron text-amber-400 text-sm ml-auto transition-transform" style="transform:rotate(180deg)">expand_more</span>
      </button>
      <div id="fin-flags-list" class="px-4 pb-3 border-t border-amber-200/60">
        <ul class="text-xs text-amber-700 space-y-1 mt-2">
          ${flags.map(f => `<li class="flex items-start gap-1.5"><span class="text-amber-400 mt-0.5 shrink-0">•</span>${escapeHtml(f.message)}</li>`).join('')}
        </ul>
      </div>
    </div>` : '';

  // Conflict banner — shown when multiple documents extracted overlapping periods
  const conflictBannerHtml = finState.conflicts.length > 0 ? `
    <div class="mb-4 rounded-lg border-2 border-blue-300 bg-blue-50 overflow-hidden">
      <div class="flex items-center gap-3 px-4 py-3 flex-wrap">
        <span class="material-symbols-outlined text-blue-600 text-lg">merge_type</span>
        <div class="flex-1 min-w-[200px]">
          <span class="text-xs font-bold text-blue-900">
            ${finState.conflicts.length} Overlapping Period${finState.conflicts.length > 1 ? 's' : ''} Found
          </span>
          <span class="text-[10px] text-blue-600 ml-2">
            Multiple documents extracted data for the same period — review &amp; choose which to keep
          </span>
        </div>
        <button onclick="openMergeView()"
          class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white rounded-md transition-colors"
          style="background:#003366;">
          <span class="material-symbols-outlined text-sm">compare_arrows</span>
          Review Conflicts
        </button>
        <button onclick="resolveAllConflicts('highest_confidence')"
          class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 border border-blue-300 rounded-md hover:bg-blue-100 transition-colors">
          <span class="material-symbols-outlined text-sm">auto_fix_high</span>
          Auto-resolve
        </button>
      </div>
    </div>` : '';

  if (!hasData) {
    container.innerHTML = flagHtml + conflictBannerHtml + `
      <div class="text-center py-10 px-4">
        <span class="material-symbols-outlined text-gray-300 text-5xl mb-3 block">table_chart</span>
        <p class="text-sm font-semibold text-gray-800 mb-1">No Financial Data Yet</p>
        <p class="text-xs text-gray-500 mb-5">Upload a CIM, P&amp;L, or financial PDF to extract the 3-statement model automatically.</p>
        <button onclick="handleExtract()" class="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-lg transition-colors shadow-sm">
          <span class="material-symbols-outlined text-sm">auto_awesome</span>
          Extract Financials
        </button>
      </div>`;
    return;
  }

  // Build tabs
  const tabTypes = ['INCOME_STATEMENT', 'BALANCE_SHEET', 'CASH_FLOW'];
  const tabLabels = { INCOME_STATEMENT: 'Income Statement', BALANCE_SHEET: 'Balance Sheet', CASH_FLOW: 'Cash Flow' };
  const tabIcons = { INCOME_STATEMENT: 'receipt_long', BALANCE_SHEET: 'account_balance', CASH_FLOW: 'payments' };
  const availableTabs = tabTypes.filter(t => finState.statements.some(s => s.statementType === t));

  if (!availableTabs.includes(finState.activeTab)) {
    finState.activeTab = availableTabs[0] ?? 'INCOME_STATEMENT';
  }

  const tabHtml = availableTabs.map(t => `
    <button onclick="switchFinancialTab('${t}')"
      class="fin-tab flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md transition-all ${finState.activeTab === t
        ? 'bg-primary text-white shadow-sm'
        : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'}"
      data-tab="${t}">
      <span class="material-symbols-outlined text-sm">${tabIcons[t]}</span>
      ${tabLabels[t]}
    </button>`).join('');

  // Chart buttons
  function mkChartBtn(type, label, icon) {
    const active = finState.chartVisible && finState.chartType === type;
    const cls = active
      ? 'bg-primary text-white border-primary shadow-sm'
      : 'text-gray-500 hover:text-gray-800 border-gray-200 hover:border-gray-300 hover:bg-gray-50';
    return `<button onclick="toggleFinancialChart('${type}')"
      class="flex items-center gap-1.5 text-xs border rounded-md px-3 py-1.5 transition-all ${cls}">
      <span class="material-symbols-outlined text-sm">${icon}</span>${label}</button>`;
  }

  let showChartBtns = '';
  if (finState.activeTab === 'INCOME_STATEMENT') {
    showChartBtns = mkChartBtn('revenue', 'Revenue', 'bar_chart') + mkChartBtn('growth', 'Growth', 'trending_up');
  } else if (finState.activeTab === 'BALANCE_SHEET') {
    showChartBtns = mkChartBtn('composition', 'Composition', 'donut_large');
  }

  // Re-extract button
  const extractBtn = `
    <button onclick="handleExtract()" id="fin-extract-btn"
      class="ml-auto flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 border border-gray-200 hover:border-gray-300 rounded-md px-3 py-1.5 transition-all hover:bg-gray-50">
      <span class="material-symbols-outlined text-sm">refresh</span>
      Re-extract
    </button>`;

  // Content: chart or table
  const showChart = finState.chartVisible && (finState.activeTab === 'INCOME_STATEMENT' || finState.activeTab === 'BALANCE_SHEET');
  const contentHtml = showChart
    ? `<div id="fin-chart-area" class="relative w-full bg-white rounded-lg border border-gray-200 p-4" style="height:320px"><canvas id="fin-chart-canvas"></canvas></div>`
    : buildStatementTable(finState.activeTab);

  container.innerHTML = flagHtml + conflictBannerHtml + `
    <div class="flex items-center gap-2 mb-4 flex-wrap">
      <div class="flex gap-1 bg-gray-50 rounded-lg p-1 border border-gray-100">
        ${tabHtml}
      </div>
      <div class="flex gap-1.5">${showChartBtns}</div>
      ${extractBtn}
    </div>
    ${contentHtml}`;

  // Render chart after DOM is set
  if (finState.chartVisible) {
    if (finState.activeTab === 'INCOME_STATEMENT') {
      if (finState.chartType === 'growth') renderGrowthChart();
      else renderRevenueChart();
    } else if (finState.activeTab === 'BALANCE_SHEET') {
      renderBalanceSheetChart();
    }
  }
}

// ─── Build statement table ────────────────────────────────────
function buildStatementTable(statementType) {
  const rows = finState.statements.filter(s => s.statementType === statementType);
  if (rows.length === 0) {
    return `<p class="text-xs text-gray-400 py-4 text-center">No ${statementType.replace('_', ' ').toLowerCase()} data available.</p>`;
  }

  rows.sort((a, b) => a.period.localeCompare(b.period));

  const unitScale = rows[0]?.unitScale ?? 'ACTUALS';

  const allKeys = new Set();
  rows.forEach(r => Object.keys(r.lineItems ?? {}).forEach(k => allKeys.add(k)));

  const orderedKeys = [
    'revenue', 'cogs', 'gross_profit', 'gross_margin_pct',
    'sga', 'rd', 'other_opex', 'total_opex',
    'ebitda', 'ebitda_margin_pct', 'da', 'ebit',
    'interest_expense', 'ebt', 'tax', 'net_income', 'sde',
    // balance sheet
    'cash', 'accounts_receivable', 'inventory', 'other_current_assets', 'total_current_assets',
    'ppe_net', 'goodwill', 'intangibles', 'total_assets',
    'accounts_payable', 'short_term_debt', 'other_current_liabilities', 'total_current_liabilities',
    'long_term_debt', 'total_liabilities', 'total_equity',
    // cash flow
    'operating_cf', 'operating_cash_flow', 'capex', 'fcf', 'free_cash_flow',
    'acquisitions', 'debt_repayment', 'dividends', 'net_change_cash',
    'investing_activities', 'financing_activities',
  ].filter(k => allKeys.has(k));

  allKeys.forEach(k => { if (!orderedKeys.includes(k)) orderedKeys.push(k); });

  const headerCells = rows.map(r => {
    const docName = r.Document?.name ?? null;
    const isProjected = r.periodType === 'PROJECTED';
    const hasConflict = finState.conflicts.some(
      c => c.statementType === statementType && c.period === r.period
    );
    const conflictIcon = hasConflict
      ? `<span class="material-symbols-outlined text-amber-500 text-xs cursor-pointer" title="Multiple versions exist — click to review" onclick="event.stopPropagation();openMergeView();" style="font-size:14px;">merge_type</span>`
      : '';
    return `
    <th class="px-3 py-3 text-right whitespace-nowrap min-w-[95px]" style="background:#fafbfc;">
      <div class="flex items-center justify-end gap-1">
        ${conflictIcon}
        <span class="text-[11px] font-semibold ${isProjected ? 'italic text-gray-400' : 'text-gray-700'}">${escapeHtml(r.period)}</span>
      </div>
      <div class="mt-1">${confidenceBadge(r.extractionConfidence)}</div>
      ${docName ? `<div class="text-[9px] text-gray-400 truncate max-w-[88px] mt-0.5" title="${escapeHtml(docName)}">${escapeHtml(docName)}</div>` : ''}
    </th>`;
  }).join('');

  const bodyRows = orderedKeys.map((key, idx) => {
    const label = LINE_ITEM_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const isSubtotal = SUBTOTAL_KEYS.has(key);
    const isPct = isPctKey(key);

    const cells = rows.map(r => {
      const val = (r.lineItems ?? {})[key];
      const display = isPct ? fmtPct(val) : fmtMoney(val, unitScale);
      const isProjected = r.periodType === 'PROJECTED';
      const valCls = isProjected ? 'text-gray-400 italic' : (isSubtotal ? 'text-gray-900 font-semibold' : 'text-gray-700');
      return `
        <td class="px-3 py-2 text-right text-xs ${valCls} cursor-pointer hover:bg-blue-50/50 transition-colors"
          onclick="editFinancialCell(this, '${r.id}', '${escapeHtml(key)}', ${JSON.stringify(val)}, '${isPct ? 'pct' : 'money'}')"
          data-statement-id="${r.id}" data-key="${escapeHtml(key)}">
          ${escapeHtml(display)}
        </td>`;
    }).join('');

    const rowBgColor = isSubtotal ? '#f7f8f9' : (idx % 2 === 0 ? '#ffffff' : '#fbfbfc');
    const labelCls = isSubtotal ? 'font-semibold text-gray-800' : (isPct ? 'text-gray-400 pl-6' : 'text-gray-500');

    return `
      <tr class="border-b border-gray-100 hover:bg-blue-50/30 transition-colors group">
        <td class="px-3 py-2 text-xs ${labelCls} whitespace-nowrap sticky left-0"
          style="z-index:2;background:${rowBgColor};box-shadow:2px 0 4px -2px rgba(0,0,0,0.06);">${escapeHtml(label)}</td>
        ${cells}
      </tr>`;
  }).join('');

  // Source attribution footer
  const docMap = new Map();
  rows.forEach(r => { if (r.Document?.id) docMap.set(r.Document.id, r.Document.name ?? 'Unknown document'); });
  const sourceFooter = docMap.size > 0
    ? `<p class="text-[10px] text-gray-400 mt-2.5 px-1 flex items-center gap-1">
        <span class="material-symbols-outlined text-xs">description</span>
        Source${docMap.size > 1 ? 's' : ''}: ${[...docMap.values()].map(n => escapeHtml(n)).join(' · ')}
      </p>`
    : '';

  return `
    <div class="overflow-x-auto rounded-lg border border-gray-200" style="box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
      <table class="w-full text-xs" style="border-collapse:separate;border-spacing:0;">
        <thead>
          <tr style="background:#fafbfc;">
            <th class="px-3 py-3 text-left text-[11px] font-semibold text-gray-500 sticky left-0 min-w-[160px]" style="background:#fafbfc;z-index:3;box-shadow:2px 0 4px -2px rgba(0,0,0,0.06);">
              Line Item <span class="text-[10px] font-normal text-gray-400">(${unitScale === 'MILLIONS' ? '$M' : unitScale === 'THOUSANDS' ? '$K' : '$'})</span>
            </th>
            ${headerCells}
          </tr>
        </thead>
        <tbody>
          ${bodyRows}
        </tbody>
      </table>
    </div>
    ${sourceFooter}`;
}

// ─── Tab switching ─────────────────────────────────────────────
function switchFinancialTab(tabType) {
  finState.activeTab = tabType;
  finState.chartVisible = false;
  finState.chartType = tabType === 'BALANCE_SHEET' ? 'composition' : 'revenue';
  if (finState.chartInstance) {
    finState.chartInstance.destroy();
    finState.chartInstance = null;
  }
  renderFinancialSection();
}

// ─── Extract financials ────────────────────────────────────────
async function handleExtract(documentId) {
  if (finState.extracting) return;
  const dealId = state.dealId;
  if (!dealId) return;

  finState.extracting = true;

  const reExtractBtn = document.getElementById('fin-extract-btn');
  if (reExtractBtn) {
    reExtractBtn.disabled = true;
    reExtractBtn.innerHTML = `<span class="material-symbols-outlined text-sm animate-spin">progress_activity</span> Extracting…`;
  }

  const allBtns = document.querySelectorAll('[onclick="handleExtract()"]');
  allBtns.forEach(b => {
    b.disabled = true;
    b.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px;animation:spin 1s linear infinite">progress_activity</span> Extracting… (30–60s)`;
  });

  if (!document.getElementById('fin-spin-style')) {
    const s = document.createElement('style');
    s.id = 'fin-spin-style';
    s.textContent = '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
    document.head.appendChild(s);
  }

  const progressMsgs = ['Extracting… (reading file)', 'Extracting… (analyzing data)', 'Extracting… (almost done)'];
  let progressIdx = 0;
  const progressTimer = setInterval(() => {
    progressIdx = (progressIdx + 1) % progressMsgs.length;
    allBtns.forEach(b => {
      if (b.disabled) b.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px;animation:spin 1s linear infinite">progress_activity</span> ${progressMsgs[progressIdx]}`;
    });
  }, 15000);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    const body = documentId ? { documentId } : {};
    const res = await PEAuth.authFetch(`${API_BASE_URL}/deals/${dealId}/financials/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error ?? `Server error ${res.status}`);
    }

    const result = await res.json();
    const stored = result.result?.periodsStored ?? 0;
    const warnings = result.result?.warnings ?? [];

    if (stored === 0) {
      const warningMsg = warnings.length > 0 ? warnings[0] : 'No financial data found in the document. Try uploading a P&L, Balance Sheet, or CIM.';
      showNotification('No Data Extracted', warningMsg, 'warning');
    } else if (result.hasConflicts) {
      showNotification('Conflicts Detected', `${stored} period${stored !== 1 ? 's' : ''} extracted — overlapping data found from multiple documents. Review the merge view.`, 'warning');
    } else {
      showNotification('Financials Extracted', `${stored} period${stored !== 1 ? 's' : ''} stored (${result.extractionMethod ?? 'gpt4o'})`, 'success');
    }

    await loadFinancials(dealId);
    // Refresh analysis after extraction
    if (typeof loadAnalysis === 'function') loadAnalysis(dealId);
  } catch (err) {
    const msg = err.name === 'AbortError'
      ? 'Extraction timed out (>2 min). The file may be too large — try again or upload a simpler P&L.'
      : (err.message ?? 'Could not extract financials');
    showNotification('Extraction Failed', msg, 'error');
    allBtns.forEach(b => {
      b.disabled = false;
      b.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px">auto_awesome</span> Extract Financials`;
    });
  } finally {
    clearInterval(progressTimer);
    clearTimeout(timeoutId);
    finState.extracting = false;
  }
}

// ─── Inline cell editing ───────────────────────────────────────
function editFinancialCell(td, statementId, key, currentVal, inputType) {
  if (td.querySelector('input')) return;

  const rawVal = currentVal !== null && currentVal !== undefined ? String(currentVal) : '';
  const original = td.textContent.trim();

  td.innerHTML = `
    <input type="number" step="any"
      class="w-full bg-white border border-primary rounded px-1.5 py-0.5 text-xs text-gray-900 text-right outline-none focus:ring-2 focus:ring-primary/30 shadow-sm"
      value="${escapeHtml(rawVal)}"
      autofocus />`;

  const input = td.querySelector('input');
  input.focus();
  input.select();

  async function commit() {
    const newVal = input.value.trim() === '' ? null : parseFloat(input.value);
    if (newVal === currentVal) {
      td.textContent = original;
      return;
    }

    td.textContent = '…';

    try {
      const res = await PEAuth.authFetch(
        `${API_BASE_URL}/deals/${state.dealId}/financials/${statementId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lineItems: { [key]: newVal } }),
        }
      );

      if (!res.ok) throw new Error('Update failed');

      const stmt = finState.statements.find(s => s.id === statementId);
      if (stmt) {
        stmt.lineItems = { ...(stmt.lineItems ?? {}), [key]: newVal };
      }

      showNotification('Updated', `${LINE_ITEM_LABELS[key] ?? key} updated`, 'success');
      renderFinancialSection();
    } catch (err) {
      showNotification('Error', 'Could not save change', 'error');
      td.textContent = original;
    }
  }

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { td.textContent = original; }
  });
}

// ─── Merge/conflict functions loaded from js/financials-merge.js
// ─── Chart functions loaded from js/financials-charts.js
// escapeHtml() loaded from js/formatters.js
