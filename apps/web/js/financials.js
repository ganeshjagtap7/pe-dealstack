/**
 * financials.js — Financial Dashboard for Deal Detail Page
 * Loaded after deal.js; uses PEAuth.authFetch, showNotification, API_BASE_URL, state from deal.js global scope.
 */

// ─── Line item display labels ─────────────────────────────────
const LINE_ITEM_LABELS = {
  // Income Statement
  revenue:             'Revenue',
  gross_profit:        'Gross Profit',
  gross_margin_pct:    'Gross Margin %',
  ebitda:              'EBITDA',
  ebitda_margin_pct:   'EBITDA Margin %',
  ebit:                'EBIT',
  net_income:          'Net Income',
  interest_expense:    'Interest Expense',
  depreciation:        'Depreciation & Amortization',
  tax_expense:         'Tax Expense',
  // Balance Sheet
  cash:                'Cash & Equivalents',
  total_assets:        'Total Assets',
  total_liabilities:   'Total Liabilities',
  total_equity:        'Total Equity',
  accounts_receivable: 'Accounts Receivable',
  inventory:           'Inventory',
  total_debt:          'Total Debt',
  // Cash Flow
  operating_cash_flow: 'Operating Cash Flow',
  capex:               'CapEx',
  free_cash_flow:      'Free Cash Flow',
  investing_activities:'Investing Activities',
  financing_activities:'Financing Activities',
};

// ─── State ────────────────────────────────────────────────────
const finState = {
  statements: [],      // raw rows from GET /financials (each has Document: {id, name})
  validation: null,    // result from GET /financials/validation
  activeTab: 'INCOME_STATEMENT',
  extracting: false,
  chartVisible: false,
  chartType: 'revenue',  // 'revenue' | 'growth' (IS tab) | 'composition' (BS tab)
  chartInstance: null,   // Chart.js instance
};

// ─── Helpers ──────────────────────────────────────────────────
function fmtMoney(val, unitScale) {
  if (val === null || val === undefined) return '—';
  const n = Number(val);
  if (isNaN(n)) return '—';
  const suffix = unitScale === 'MILLIONS' ? 'M' : unitScale === 'THOUSANDS' ? 'K' : '';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + suffix;
}

function fmtPct(val) {
  if (val === null || val === undefined) return '—';
  const n = Number(val);
  if (isNaN(n)) return '—';
  return n.toFixed(1) + '%';
}

function isPctKey(key) {
  return key.endsWith('_pct') || key.endsWith('_margin');
}

function confidenceBadge(conf) {
  const pct = Math.round(conf ?? 0);  // DB stores 0-100, not 0-1
  let cls = 'bg-red-900/40 text-red-300 border-red-700/40';
  if (pct >= 80) cls = 'bg-green-900/40 text-green-300 border-green-700/40';
  else if (pct >= 50) cls = 'bg-yellow-900/40 text-yellow-300 border-yellow-700/40';
  return `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded border ${cls}">${pct}%</span>`;
}

function periodTypeClass(periodType) {
  return periodType === 'PROJECTED' ? 'italic text-text-muted' : '';
}

// ─── Main entry point ─────────────────────────────────────────
async function loadFinancials(dealId) {
  try {
    const [stmtsRes, validRes] = await Promise.all([
      PEAuth.authFetch(`${API_BASE_URL}/deals/${dealId}/financials`),
      PEAuth.authFetch(`${API_BASE_URL}/deals/${dealId}/financials/validation`),
    ]);

    if (stmtsRes.ok) finState.statements = await stmtsRes.json();
    if (validRes.ok) finState.validation = await validRes.json();
  } catch (err) {
    console.warn('[financials] load error', err);
  }

  renderFinancialSection();
  renderFinStatusBadge();
}

// ─── Status badge in deal header ──────────────────────────────
function renderFinStatusBadge() {
  const badge = document.getElementById('fin-status-badge');
  if (!badge) return;

  const hasData = finState.statements.length > 0;
  const flags = finState.validation?.checks ?? [];
  const hasFlags = flags.length > 0;

  if (!hasData) {
    badge.textContent = 'No Financials';
    badge.className = 'px-2.5 py-0.5 rounded text-xs font-semibold border cursor-pointer transition-opacity hover:opacity-80 bg-gray-100 text-gray-500 border-gray-200';
    badge.classList.remove('hidden');
    return;
  }

  // Compute overall confidence across all stored statements
  const confidences = finState.statements
    .map(s => s.extractionConfidence)
    .filter(c => c !== null && c !== undefined);
  const avgConf = confidences.length > 0
    ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)  // DB stores 0-100
    : 0;

  if (hasFlags) {
    badge.textContent = `Financials: Needs Review`;
    badge.className = 'px-2.5 py-0.5 rounded text-xs font-semibold border cursor-pointer transition-opacity hover:opacity-80 bg-amber-50 text-amber-600 border-amber-200';
  } else if (avgConf >= 80) {
    badge.textContent = `Financials: ${avgConf}% confidence`;
    badge.className = 'px-2.5 py-0.5 rounded text-xs font-semibold border cursor-pointer transition-opacity hover:opacity-80 bg-green-50 text-green-700 border-green-200';
  } else if (avgConf >= 50) {
    badge.textContent = `Financials: ${avgConf}% confidence`;
    badge.className = 'px-2.5 py-0.5 rounded text-xs font-semibold border cursor-pointer transition-opacity hover:opacity-80 bg-yellow-50 text-yellow-700 border-yellow-200';
  } else {
    badge.textContent = `Financials: Low confidence`;
    badge.className = 'px-2.5 py-0.5 rounded text-xs font-semibold border cursor-pointer transition-opacity hover:opacity-80 bg-red-50 text-red-600 border-red-200';
  }

  badge.classList.remove('hidden');
}

/** Open the financials panel and scroll it into view */
function openFinancialsPanel() {
  const body = document.getElementById('financials-body');
  if (body) {
    body.style.display = 'block';
    const chevron = document.querySelector('#financials-toggle .fin-chevron');
    if (chevron) chevron.style.transform = 'rotate(180deg)';
  }
  document.getElementById('financials-toggle')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Show per-statement-type confidence breakdown popup on badge click */
function showConfidencePopup(event) {
  // Remove existing popup if any
  document.getElementById('fin-conf-popup')?.remove();

  const hasData = finState.statements.length > 0;
  if (!hasData) {
    openFinancialsPanel();
    return;
  }

  // Per-statement-type confidence averages
  const byType = {};
  for (const s of finState.statements) {
    if (!byType[s.statementType]) byType[s.statementType] = [];
    if (s.extractionConfidence != null) byType[s.statementType].push(s.extractionConfidence);
  }

  const typeLabels = {
    INCOME_STATEMENT: 'Income Statement',
    BALANCE_SHEET: 'Balance Sheet',
    CASH_FLOW: 'Cash Flow',
  };

  const rows = Object.entries(byType).map(([type, confs]) => {
    const avg = Math.round(confs.reduce((a, b) => a + b, 0) / confs.length);
    const label = typeLabels[type] ?? type.replace(/_/g, ' ');
    const periodCount = finState.statements.filter(s => s.statementType === type).length;
    return `
      <div class="flex items-center justify-between gap-4 py-1.5 border-b border-border/30 last:border-0">
        <div>
          <span class="text-xs text-text-main">${escapeHtml(label)}</span>
          <span class="text-[10px] text-text-muted ml-1">(${periodCount} period${periodCount !== 1 ? 's' : ''})</span>
        </div>
        ${confidenceBadge(avg)}
      </div>`;
  }).join('');

  // Overall confidence
  const allConfs = finState.statements.map(s => s.extractionConfidence).filter(c => c != null);
  const overall = allConfs.length > 0
    ? Math.round(allConfs.reduce((a, b) => a + b, 0) / allConfs.length)
    : 0;

  // Extraction sources
  const sources = [...new Set(finState.statements.map(s => s.extractionSource).filter(Boolean))];
  const sourceHtml = sources.length > 0
    ? `<div class="text-[10px] text-text-muted mt-2 opacity-60">Method: ${escapeHtml(sources.join(', '))}</div>`
    : '';

  // Validation flag summary
  const flags = finState.validation?.checks ?? [];
  const flagsHtml = flags.length > 0
    ? `<div class="mt-2 flex items-center gap-1.5 text-[10px] text-amber-400">
        <span class="material-symbols-outlined text-xs">warning</span>
        ${flags.length} validation flag${flags.length !== 1 ? 's' : ''} — needs review
      </div>`
    : '';

  const popup = document.createElement('div');
  popup.id = 'fin-conf-popup';
  popup.className = 'fixed z-[9999] bg-bg-secondary border border-border rounded-xl shadow-2xl p-4 min-w-[250px]';
  popup.innerHTML = `
    <div class="flex items-center justify-between mb-3">
      <span class="text-xs font-semibold text-text-main">Extraction Confidence</span>
      <button onclick="document.getElementById('fin-conf-popup')?.remove()"
        class="text-text-muted hover:text-text-main ml-4">
        <span class="material-symbols-outlined text-sm leading-none">close</span>
      </button>
    </div>
    <div>${rows}</div>
    <div class="flex items-center justify-between mt-3 pt-2 border-t border-border/40">
      <span class="text-[10px] text-text-muted">Overall</span>
      ${confidenceBadge(overall)}
    </div>
    ${sourceHtml}
    ${flagsHtml}
    <button onclick="document.getElementById('fin-conf-popup')?.remove(); openFinancialsPanel();"
      class="mt-3 w-full text-xs text-primary hover:underline text-left flex items-center gap-1">
      <span class="material-symbols-outlined text-sm leading-none">arrow_forward</span>
      View financial statements
    </button>`;

  // Position below the badge
  const rect = event.currentTarget.getBoundingClientRect();
  popup.style.top = (rect.bottom + 8) + 'px';
  popup.style.left = rect.left + 'px';
  document.body.appendChild(popup);

  // Adjust if popup overflows right edge
  requestAnimationFrame(() => {
    const pr = popup.getBoundingClientRect();
    if (pr.right > window.innerWidth - 16) {
      popup.style.left = (window.innerWidth - pr.width - 16) + 'px';
    }
  });

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!popup.contains(e.target)) {
        popup.remove();
        document.removeEventListener('click', handler);
      }
    });
  }, 0);
}

// ─── Render the full section ───────────────────────────────────
function renderFinancialSection() {
  const container = document.getElementById('financials-content');
  if (!container) return;

  const hasData = finState.statements.length > 0;

  // Red-flag banner
  const flags = finState.validation?.checks ?? [];
  const flagHtml = flags.length > 0 ? `
    <div class="mb-4 bg-red-900/20 border border-red-700/40 rounded-lg px-4 py-3 flex items-start gap-3">
      <span class="material-symbols-outlined text-red-400 text-base mt-0.5 shrink-0">warning</span>
      <div>
        <p class="text-xs font-semibold text-red-300 mb-1">${flags.length} Validation Flag${flags.length > 1 ? 's' : ''}</p>
        <ul class="text-xs text-red-200 space-y-0.5">
          ${flags.map(f => `<li>• ${escapeHtml(f.message)}</li>`).join('')}
        </ul>
      </div>
    </div>` : '';

  if (!hasData) {
    container.innerHTML = flagHtml + `
      <div class="text-center py-10 px-4">
        <span class="material-symbols-outlined text-primary/50 text-5xl mb-3 block">table_chart</span>
        <p class="text-sm font-semibold text-text-main mb-1">No Financial Data Yet</p>
        <p class="text-xs text-text-muted mb-5">Upload a CIM, P&amp;L, or financial PDF to extract the 3-statement model automatically.</p>
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
  const availableTabs = tabTypes.filter(t => finState.statements.some(s => s.statementType === t));

  if (!availableTabs.includes(finState.activeTab)) {
    finState.activeTab = availableTabs[0] ?? 'INCOME_STATEMENT';
  }

  const tabHtml = availableTabs.map(t => `
    <button onclick="switchFinancialTab('${t}')"
      class="fin-tab px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${finState.activeTab === t
        ? 'bg-primary text-white'
        : 'text-text-muted hover:text-text-main'}"
      data-tab="${t}">
      ${tabLabels[t]}
    </button>`).join('');

  // Chart buttons — different per tab
  function mkChartBtn(type, label, icon) {
    const active = finState.chartVisible && finState.chartType === type;
    const cls = active
      ? 'bg-primary text-white border-primary'
      : 'text-text-muted hover:text-text-main border-border';
    return `<button onclick="toggleFinancialChart('${type}')"
      class="flex items-center gap-1.5 text-xs border rounded-md px-3 py-1.5 transition-colors ${cls}">
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
      class="ml-auto flex items-center gap-1.5 text-xs text-text-muted hover:text-text-main border border-border rounded-md px-3 py-1.5 transition-colors">
      <span class="material-symbols-outlined text-sm">refresh</span>
      Re-extract
    </button>`;

  // Content: chart or table
  const showChart = finState.chartVisible && (finState.activeTab === 'INCOME_STATEMENT' || finState.activeTab === 'BALANCE_SHEET');
  const contentHtml = showChart
    ? `<div id="fin-chart-area" class="relative w-full" style="height:300px"><canvas id="fin-chart-canvas"></canvas></div>`
    : buildStatementTable(finState.activeTab);

  container.innerHTML = flagHtml + `
    <div class="flex items-center gap-2 mb-4 flex-wrap">
      <div class="flex gap-1 bg-bg-tertiary rounded-lg p-1">
        ${tabHtml}
      </div>
      <div class="flex gap-1">${showChartBtns}</div>
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
    return `<p class="text-xs text-text-muted py-4 text-center">No ${statementType.replace('_', ' ').toLowerCase()} data available.</p>`;
  }

  // Sort by period
  rows.sort((a, b) => a.period.localeCompare(b.period));

  const unitScale = rows[0]?.unitScale ?? 'ACTUALS';

  // Collect all line item keys across all periods
  const allKeys = new Set();
  rows.forEach(r => Object.keys(r.lineItems ?? {}).forEach(k => allKeys.add(k)));

  // Preferred order for income statement
  const orderedKeys = [
    'revenue', 'gross_profit', 'gross_margin_pct',
    'ebitda', 'ebitda_margin_pct', 'ebit',
    'depreciation', 'interest_expense', 'tax_expense', 'net_income',
    // balance sheet
    'cash', 'accounts_receivable', 'inventory', 'total_assets',
    'total_liabilities', 'total_debt', 'total_equity',
    // cash flow
    'operating_cash_flow', 'capex', 'free_cash_flow',
    'investing_activities', 'financing_activities',
  ].filter(k => allKeys.has(k));

  // Add any remaining keys not in preferred order
  allKeys.forEach(k => { if (!orderedKeys.includes(k)) orderedKeys.push(k); });

  const headerCells = rows.map(r => {
    const docName = r.Document?.name ?? null;
    return `
    <th class="px-3 py-2 text-right text-[11px] font-semibold text-text-muted whitespace-nowrap min-w-[90px]">
      <div class="${periodTypeClass(r.periodType)}">${escapeHtml(r.period)}</div>
      <div class="mt-0.5">${confidenceBadge(r.extractionConfidence)}</div>
      ${docName ? `<div class="text-[9px] opacity-40 truncate max-w-[88px] mt-0.5" title="${escapeHtml(docName)}">${escapeHtml(docName)}</div>` : ''}
    </th>`;
  }).join('');

  const bodyRows = orderedKeys.map(key => {
    const label = LINE_ITEM_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const cells = rows.map(r => {
      const val = (r.lineItems ?? {})[key];
      const display = isPctKey(key) ? fmtPct(val) : fmtMoney(val, unitScale);
      const isProjected = r.periodType === 'PROJECTED';
      return `
        <td class="px-3 py-2 text-right text-xs ${isProjected ? 'italic text-text-muted' : 'text-text-main'} cursor-pointer hover:bg-white/5 transition-colors"
          onclick="editFinancialCell(this, '${r.id}', '${escapeHtml(key)}', ${JSON.stringify(val)}, '${isPctKey(key) ? 'pct' : 'money'}')"
          data-statement-id="${r.id}" data-key="${escapeHtml(key)}">
          ${escapeHtml(display)}
        </td>`;
    }).join('');

    return `
      <tr class="border-b border-border/30 hover:bg-white/[0.02] group">
        <td class="px-3 py-2 text-xs text-text-muted font-medium whitespace-nowrap sticky left-0 bg-bg-secondary">${escapeHtml(label)}</td>
        ${cells}
      </tr>`;
  }).join('');

  // Source attribution footer — show contributing documents
  const docMap = new Map();
  rows.forEach(r => { if (r.Document?.id) docMap.set(r.Document.id, r.Document.name ?? 'Unknown document'); });
  const sourceFooter = docMap.size > 0
    ? `<p class="text-[10px] text-text-muted mt-2 px-1 opacity-70">
        Source${docMap.size > 1 ? 's' : ''}: ${[...docMap.values()].map(n => escapeHtml(n)).join(' · ')}
      </p>`
    : '';

  return `
    <div class="overflow-x-auto rounded-lg border border-border/40">
      <table class="w-full text-xs">
        <thead class="bg-bg-tertiary/60">
          <tr>
            <th class="px-3 py-2 text-left text-[11px] font-semibold text-text-muted sticky left-0 bg-bg-tertiary/60 min-w-[160px]">
              Line Item <span class="text-[10px] font-normal opacity-60">(${unitScale === 'MILLIONS' ? '$M' : unitScale === 'THOUSANDS' ? '$K' : '$'})</span>
            </th>
            ${headerCells}
          </tr>
        </thead>
        <tbody class="bg-bg-secondary">
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

  const btn = document.getElementById('fin-extract-btn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="material-symbols-outlined text-sm animate-spin">progress_activity</span> Extracting…`;
  }

  // Also update the empty-state button if present
  const allBtns = document.querySelectorAll('[onclick="handleExtract()"]');
  allBtns.forEach(b => { b.disabled = true; });

  try {
    const body = documentId ? { documentId } : {};
    const res = await PEAuth.authFetch(`${API_BASE_URL}/deals/${dealId}/financials/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? 'Extraction failed');
    }

    const result = await res.json();
    const stored = result.result?.periodsStored ?? 0;
    showNotification('Financials Extracted', `${stored} period${stored !== 1 ? 's' : ''} stored successfully`, 'success');

    // Reload financial data
    await loadFinancials(dealId);
  } catch (err) {
    showNotification('Extraction Failed', err.message ?? 'Could not extract financials', 'error');
  } finally {
    finState.extracting = false;
  }
}

// ─── Inline cell editing ───────────────────────────────────────
function editFinancialCell(td, statementId, key, currentVal, inputType) {
  if (td.querySelector('input')) return; // already editing

  const rawVal = currentVal !== null && currentVal !== undefined ? String(currentVal) : '';
  const original = td.textContent.trim();

  td.innerHTML = `
    <input type="number" step="any"
      class="w-full bg-bg-tertiary border border-primary/60 rounded px-1.5 py-0.5 text-xs text-text-main text-right outline-none focus:ring-1 focus:ring-primary"
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

      // Update local state
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

// ─── Chart toggle ─────────────────────────────────────────────
// type = 'revenue' | 'growth' | 'composition'
// Clicking the active chart type hides it (toggle off); clicking a new type switches to it.
function toggleFinancialChart(type) {
  if (finState.chartVisible && finState.chartType === type) {
    finState.chartVisible = false;
  } else {
    finState.chartVisible = true;
    finState.chartType = type;
  }
  if (finState.chartInstance) {
    finState.chartInstance.destroy();
    finState.chartInstance = null;
  }
  renderFinancialSection();
}

// ─── Chart rendering (Chart.js) ───────────────────────────────
function renderRevenueChart() {
  const rows = finState.statements
    .filter(s => s.statementType === 'INCOME_STATEMENT')
    .sort((a, b) => a.period.localeCompare(b.period));

  if (rows.length === 0) return;

  const canvas = document.getElementById('fin-chart-canvas');
  if (!canvas) return;

  if (finState.chartInstance) {
    finState.chartInstance.destroy();
    finState.chartInstance = null;
  }

  const labels = rows.map(r => r.period);
  const revenues = rows.map(r => (r.lineItems?.revenue ?? null));
  const ebitdas = rows.map(r => (r.lineItems?.ebitda ?? null));
  const margins = rows.map(r => (r.lineItems?.ebitda_margin_pct ?? null));

  // Lighter shade for projected periods
  const revColors = rows.map(r =>
    r.periodType === 'PROJECTED' ? 'rgba(0,51,102,0.35)' : 'rgba(0,51,102,0.8)');
  const ebitdaColors = rows.map(r =>
    r.periodType === 'PROJECTED' ? 'rgba(5,150,105,0.35)' : 'rgba(5,150,105,0.8)');

  const unitLabel = rows[0]?.unitScale === 'THOUSANDS' ? '$K' : '$M';

  finState.chartInstance = new Chart(canvas, {
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: `Revenue (${unitLabel})`,
          data: revenues,
          backgroundColor: revColors,
          borderRadius: 4,
          yAxisID: 'y',
          order: 2,
        },
        {
          type: 'bar',
          label: `EBITDA (${unitLabel})`,
          data: ebitdas,
          backgroundColor: ebitdaColors,
          borderRadius: 4,
          yAxisID: 'y',
          order: 2,
        },
        {
          type: 'line',
          label: 'EBITDA Margin %',
          data: margins,
          borderColor: '#F59E0B',
          backgroundColor: 'rgba(245,158,11,0.08)',
          pointBackgroundColor: '#F59E0B',
          pointRadius: 4,
          borderWidth: 2,
          tension: 0.35,
          yAxisID: 'y1',
          order: 1,
          spanGaps: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { size: 11 }, boxWidth: 12, padding: 16 },
        },
        tooltip: {
          callbacks: {
            label(ctx) {
              const v = ctx.raw;
              if (v === null || v === undefined) return '';
              if (ctx.dataset.yAxisID === 'y1') return ` EBITDA Margin: ${Number(v).toFixed(1)}%`;
              return ` ${ctx.dataset.label}: $${Number(v).toFixed(1)}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 11 } },
        },
        y: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: unitLabel, font: { size: 11 } },
          ticks: { font: { size: 11 } },
          grid: { color: 'rgba(0,0,0,0.06)' },
        },
        y1: {
          type: 'linear',
          position: 'right',
          title: { display: true, text: 'Margin %', font: { size: 11 } },
          ticks: {
            font: { size: 11 },
            callback: v => v + '%',
          },
          grid: { drawOnChartArea: false },
        },
      },
    },
  });
}

// ─── YoY Revenue Growth chart ─────────────────────────────────
function renderGrowthChart() {
  const rows = finState.statements
    .filter(s => s.statementType === 'INCOME_STATEMENT')
    .sort((a, b) => a.period.localeCompare(b.period));

  const canvas = document.getElementById('fin-chart-canvas');
  if (!canvas) return;

  if (finState.chartInstance) {
    finState.chartInstance.destroy();
    finState.chartInstance = null;
  }

  if (rows.length < 2) {
    canvas.parentElement.innerHTML = '<p class="text-xs text-text-muted text-center py-8">Need at least 2 periods to show growth.</p>';
    return;
  }

  const labels = [];
  const growthData = [];
  const colors = [];

  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1].lineItems?.revenue;
    const curr = rows[i].lineItems?.revenue;
    if (prev != null && curr != null && prev !== 0) {
      const pct = ((curr - prev) / Math.abs(prev)) * 100;
      labels.push(rows[i].period);
      growthData.push(parseFloat(pct.toFixed(1)));
      colors.push(rows[i].periodType === 'PROJECTED'
        ? (pct >= 0 ? 'rgba(5,150,105,0.35)' : 'rgba(220,38,38,0.35)')
        : (pct >= 0 ? 'rgba(5,150,105,0.8)' : 'rgba(220,38,38,0.8)'));
    }
  }

  if (labels.length === 0) {
    canvas.parentElement.innerHTML = '<p class="text-xs text-text-muted text-center py-8">No revenue data available for growth calculation.</p>';
    return;
  }

  finState.chartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Revenue YoY Growth %',
        data: growthData,
        backgroundColor: colors,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${Number(ctx.raw) >= 0 ? '+' : ''}${Number(ctx.raw).toFixed(1)}%`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: {
          ticks: { font: { size: 11 }, callback: v => v + '%' },
          grid: { color: 'rgba(0,0,0,0.06)' },
        },
      },
    },
  });
}

// ─── Balance Sheet Composition chart ──────────────────────────
// Stacked bar: Assets (blue shades) vs Liabilities + Equity (red/green) side-by-side per period
function renderBalanceSheetChart() {
  const rows = finState.statements
    .filter(s => s.statementType === 'BALANCE_SHEET')
    .sort((a, b) => a.period.localeCompare(b.period));

  const canvas = document.getElementById('fin-chart-canvas');
  if (!canvas) return;

  if (finState.chartInstance) {
    finState.chartInstance.destroy();
    finState.chartInstance = null;
  }

  if (rows.length === 0) {
    canvas.parentElement.innerHTML = '<p class="text-xs text-text-muted text-center py-8">No balance sheet data available.</p>';
    return;
  }

  const labels = rows.map(r => r.period);
  const li = (row, key) => row.lineItems?.[key] ?? 0;
  const unitLabel = rows[0]?.unitScale === 'THOUSANDS' ? '$K' : '$M';

  finState.chartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        // ── Asset stack ──
        {
          label: 'Cash',
          data: rows.map(r => li(r, 'cash')),
          backgroundColor: 'rgba(37,99,235,0.85)',
          stack: 'assets',
          borderWidth: 0,
        },
        {
          label: 'Receivables',
          data: rows.map(r => li(r, 'accounts_receivable')),
          backgroundColor: 'rgba(59,130,246,0.75)',
          stack: 'assets',
          borderWidth: 0,
        },
        {
          label: 'Inventory',
          data: rows.map(r => li(r, 'inventory')),
          backgroundColor: 'rgba(96,165,250,0.7)',
          stack: 'assets',
          borderWidth: 0,
        },
        {
          label: 'PP&E',
          data: rows.map(r => li(r, 'ppe_net')),
          backgroundColor: 'rgba(147,197,253,0.75)',
          stack: 'assets',
          borderWidth: 0,
        },
        {
          label: 'Goodwill + Intangibles',
          data: rows.map(r => (li(r, 'goodwill') || 0) + (li(r, 'intangibles') || 0)),
          backgroundColor: 'rgba(186,230,253,0.7)',
          stack: 'assets',
          borderWidth: 0,
        },
        // ── Liabilities + Equity stack ──
        {
          label: 'Current Liabilities',
          data: rows.map(r => li(r, 'total_current_liabilities')),
          backgroundColor: 'rgba(220,38,38,0.8)',
          stack: 'liabilities',
          borderWidth: 0,
        },
        {
          label: 'Long-term Debt',
          data: rows.map(r => li(r, 'long_term_debt')),
          backgroundColor: 'rgba(239,68,68,0.6)',
          stack: 'liabilities',
          borderWidth: 0,
        },
        {
          label: 'Equity',
          data: rows.map(r => li(r, 'total_equity')),
          backgroundColor: 'rgba(5,150,105,0.75)',
          stack: 'liabilities',
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { size: 10 }, boxWidth: 10, padding: 10 },
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              const v = ctx.raw;
              if (!v) return '';
              return ` ${ctx.dataset.label}: $${Number(v).toFixed(1)}${unitLabel.replace('$', '')}`;
            },
          },
        },
        title: {
          display: true,
          text: 'Assets  ·  Liabilities + Equity',
          font: { size: 10 },
          color: '#9ca3af',
          padding: { bottom: 2 },
        },
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: { font: { size: 11 } },
        },
        y: {
          stacked: true,
          title: { display: true, text: unitLabel, font: { size: 11 } },
          ticks: { font: { size: 11 } },
          grid: { color: 'rgba(0,0,0,0.06)' },
        },
      },
    },
  });
}

// ─── Utility ──────────────────────────────────────────────────
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
