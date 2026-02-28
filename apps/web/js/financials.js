/**
 * financials.js — Financial Dashboard for Deal Detail Page
 * Loaded after deal.js; uses PEAuth.authFetch, showNotification, API_BASE_URL, state from deal.js global scope.
 */

// ─── Line item display labels ─────────────────────────────────
const LINE_ITEM_LABELS = {
  // Income Statement
  revenue:             'Revenue',
  cogs:                'Cost of Goods Sold',
  gross_profit:        'Gross Profit',
  gross_margin_pct:    'Gross Margin %',
  sga:                 'SG&A',
  rd:                  'R&D',
  other_opex:          'Other OpEx',
  total_opex:          'Total OpEx',
  ebitda:              'EBITDA',
  ebitda_margin_pct:   'EBITDA Margin %',
  da:                  'D&A',
  ebit:                'EBIT',
  interest_expense:    'Interest Expense',
  ebt:                 'EBT',
  tax:                 'Tax',
  net_income:          'Net Income',
  sde:                 'SDE',
  depreciation:        'D&A',
  tax_expense:         'Tax Expense',
  // Balance Sheet
  cash:                'Cash & Equivalents',
  accounts_receivable: 'Accounts Receivable',
  inventory:           'Inventory',
  other_current_assets:'Other Current Assets',
  total_current_assets:'Total Current Assets',
  ppe_net:             'PP&E (Net)',
  goodwill:            'Goodwill',
  intangibles:         'Intangibles',
  total_assets:        'Total Assets',
  accounts_payable:    'Accounts Payable',
  short_term_debt:     'Short-term Debt',
  other_current_liabilities: 'Other Current Liabilities',
  total_current_liabilities: 'Total Current Liabilities',
  long_term_debt:      'Long-term Debt',
  total_liabilities:   'Total Liabilities',
  total_equity:        'Total Equity',
  total_debt:          'Total Debt',
  // Cash Flow
  operating_cf:        'Operating Cash Flow',
  operating_cash_flow: 'Operating Cash Flow',
  capex:               'CapEx',
  fcf:                 'Free Cash Flow',
  free_cash_flow:      'Free Cash Flow',
  acquisitions:        'Acquisitions',
  debt_repayment:      'Debt Repayment',
  dividends:           'Dividends',
  net_change_cash:     'Net Change in Cash',
  investing_activities:'Investing Activities',
  financing_activities:'Financing Activities',
};

// Bold/subtotal rows — these get emphasized styling
const SUBTOTAL_KEYS = new Set([
  'revenue', 'gross_profit', 'ebitda', 'ebit', 'net_income', 'sde',
  'total_current_assets', 'total_assets', 'total_current_liabilities',
  'total_liabilities', 'total_equity', 'fcf', 'free_cash_flow',
  'operating_cf', 'operating_cash_flow', 'net_change_cash',
]);

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
  const pct = Math.round(conf ?? 0);
  let cls, dotColor;
  if (pct >= 80) { cls = 'bg-emerald-50 text-emerald-700 border-emerald-200'; dotColor = '#059669'; }
  else if (pct >= 50) { cls = 'bg-amber-50 text-amber-700 border-amber-200'; dotColor = '#d97706'; }
  else { cls = 'bg-red-50 text-red-600 border-red-200'; dotColor = '#dc2626'; }
  return `<span class="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${cls}">
    <span style="width:5px;height:5px;border-radius:50%;background:${dotColor};display:inline-block;"></span>${pct}%</span>`;
}

function periodTypeClass(periodType) {
  return periodType === 'PROJECTED' ? 'italic text-gray-400' : '';
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

  const confidences = finState.statements
    .map(s => s.extractionConfidence)
    .filter(c => c !== null && c !== undefined);
  const avgConf = confidences.length > 0
    ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)
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
  document.getElementById('fin-conf-popup')?.remove();

  const hasData = finState.statements.length > 0;
  if (!hasData) {
    openFinancialsPanel();
    return;
  }

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
      <div class="flex items-center justify-between gap-4 py-2 border-b border-gray-100 last:border-0">
        <div>
          <span class="text-xs font-medium text-gray-800">${escapeHtml(label)}</span>
          <span class="text-[10px] text-gray-400 ml-1">(${periodCount} period${periodCount !== 1 ? 's' : ''})</span>
        </div>
        ${confidenceBadge(avg)}
      </div>`;
  }).join('');

  const allConfs = finState.statements.map(s => s.extractionConfidence).filter(c => c != null);
  const overall = allConfs.length > 0
    ? Math.round(allConfs.reduce((a, b) => a + b, 0) / allConfs.length)
    : 0;

  const sources = [...new Set(finState.statements.map(s => s.extractionSource).filter(Boolean))];
  const sourceHtml = sources.length > 0
    ? `<div class="text-[10px] text-gray-400 mt-2">Method: ${escapeHtml(sources.join(', '))}</div>`
    : '';

  const flags = finState.validation?.checks ?? [];
  const flagsHtml = flags.length > 0
    ? `<div class="mt-2 flex items-center gap-1.5 text-[10px] text-amber-600">
        <span class="material-symbols-outlined text-xs">warning</span>
        ${flags.length} validation flag${flags.length !== 1 ? 's' : ''} — needs review
      </div>`
    : '';

  const popup = document.createElement('div');
  popup.id = 'fin-conf-popup';
  popup.className = 'fixed z-[9999] bg-white border border-gray-200 rounded-xl p-4 min-w-[260px]';
  popup.style.cssText = 'box-shadow: 0 10px 40px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08);';
  popup.innerHTML = `
    <div class="flex items-center justify-between mb-3">
      <span class="text-xs font-bold text-gray-900">Extraction Confidence</span>
      <button onclick="document.getElementById('fin-conf-popup')?.remove()"
        class="text-gray-400 hover:text-gray-600 ml-4">
        <span class="material-symbols-outlined text-sm leading-none">close</span>
      </button>
    </div>
    <div>${rows}</div>
    <div class="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
      <span class="text-[10px] text-gray-500 font-medium">Overall</span>
      ${confidenceBadge(overall)}
    </div>
    ${sourceHtml}
    ${flagsHtml}
    <button onclick="document.getElementById('fin-conf-popup')?.remove(); openFinancialsPanel();"
      class="mt-3 w-full text-xs text-primary hover:underline text-left flex items-center gap-1 font-medium">
      <span class="material-symbols-outlined text-sm leading-none">arrow_forward</span>
      View financial statements
    </button>`;

  const rect = event.currentTarget.getBoundingClientRect();
  popup.style.top = (rect.bottom + 8) + 'px';
  popup.style.left = rect.left + 'px';
  document.body.appendChild(popup);

  requestAnimationFrame(() => {
    const pr = popup.getBoundingClientRect();
    if (pr.right > window.innerWidth - 16) {
      popup.style.left = (window.innerWidth - pr.width - 16) + 'px';
    }
  });

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

  if (!hasData) {
    container.innerHTML = flagHtml + `
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

  container.innerHTML = flagHtml + `
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
    return `
    <th class="px-3 py-3 text-right whitespace-nowrap min-w-[95px]" style="background:#fafbfc;">
      <div class="text-[11px] font-semibold ${isProjected ? 'italic text-gray-400' : 'text-gray-700'}">${escapeHtml(r.period)}</div>
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
    } else {
      showNotification('Financials Extracted', `${stored} period${stored !== 1 ? 's' : ''} stored (${result.extractionMethod ?? 'gpt4o'})`, 'success');
    }

    await loadFinancials(dealId);
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

// ─── Chart toggle ─────────────────────────────────────────────
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

// ─── Chart helpers ────────────────────────────────────────────

/** Shared premium tooltip config */
const CHART_TOOLTIP = {
  backgroundColor: 'rgba(255,255,255,0.98)',
  titleColor: '#111827',
  titleFont: { size: 12, family: 'Inter', weight: '600' },
  bodyColor: '#4b5563',
  bodyFont: { size: 11, family: 'Inter' },
  borderColor: '#e5e7eb',
  borderWidth: 1,
  padding: { top: 10, bottom: 10, left: 14, right: 14 },
  cornerRadius: 10,
  boxPadding: 4,
  usePointStyle: true,
  caretSize: 6,
};

/** Shared premium legend config */
const CHART_LEGEND = {
  position: 'bottom',
  labels: {
    font: { size: 11, family: 'Inter', weight: '500' },
    boxWidth: 14,
    boxHeight: 8,
    padding: 18,
    color: '#6b7280',
    usePointStyle: true,
    pointStyleWidth: 14,
  },
};

/** Create a vertical gradient for a bar dataset */
function createGradient(ctx, colorTop, colorBottom, height) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height || 300);
  gradient.addColorStop(0, colorTop);
  gradient.addColorStop(1, colorBottom);
  return gradient;
}

/**
 * Filter chart data to avoid mixing annual totals with quarterly data.
 * If we have both "FY" / full-year and quarterly periods, only show quarterly.
 */
function filterConsistentPeriods(rows) {
  const isFY = p => /^FY\b/i.test(p.period) || /^\d{4}$/i.test(p.period);
  const fyRows = rows.filter(r => isFY(r));
  const nonFyRows = rows.filter(r => !isFY(r));
  // If we have both annual and non-annual, prefer non-annual (quarterly/monthly) for better chart scale
  if (fyRows.length > 0 && nonFyRows.length >= 2) return nonFyRows;
  return rows;
}

// ─── Chart rendering (Chart.js) ───────────────────────────────
function renderRevenueChart() {
  let rows = finState.statements
    .filter(s => s.statementType === 'INCOME_STATEMENT')
    .sort((a, b) => a.period.localeCompare(b.period));

  if (rows.length === 0) return;

  const canvas = document.getElementById('fin-chart-canvas');
  if (!canvas) return;

  if (finState.chartInstance) { finState.chartInstance.destroy(); finState.chartInstance = null; }

  // Filter to avoid mixing annual totals with quarterly data
  rows = filterConsistentPeriods(rows);

  const ctx = canvas.getContext('2d');
  const labels = rows.map(r => r.period);
  const revenues = rows.map(r => (r.lineItems?.revenue ?? null));
  const ebitdas = rows.map(r => (r.lineItems?.ebitda ?? null));
  const margins = rows.map(r => (r.lineItems?.ebitda_margin_pct ?? null));
  const unitLabel = rows[0]?.unitScale === 'THOUSANDS' ? '$K' : '$M';

  // Gradient fills
  const revGradient = createGradient(ctx, 'rgba(0,51,102,0.9)', 'rgba(0,51,102,0.4)', 280);
  const ebitdaGradient = createGradient(ctx, 'rgba(5,150,105,0.85)', 'rgba(5,150,105,0.35)', 280);
  const marginGradient = createGradient(ctx, 'rgba(245,158,11,0.15)', 'rgba(245,158,11,0.01)', 280);

  // Projected period bar patterns — lighter with dashed border
  const revColors = rows.map(r => r.periodType === 'PROJECTED' ? 'rgba(0,51,102,0.2)' : revGradient);
  const ebitdaColors = rows.map(r => r.periodType === 'PROJECTED' ? 'rgba(5,150,105,0.2)' : ebitdaGradient);
  const revBorders = rows.map(r => r.periodType === 'PROJECTED' ? 'rgba(0,51,102,0.4)' : 'transparent');
  const ebitdaBorders = rows.map(r => r.periodType === 'PROJECTED' ? 'rgba(5,150,105,0.4)' : 'transparent');

  finState.chartInstance = new Chart(canvas, {
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: `Revenue (${unitLabel})`,
          data: revenues,
          backgroundColor: revColors,
          borderColor: revBorders,
          borderWidth: 1,
          borderRadius: 6,
          borderSkipped: false,
          yAxisID: 'y',
          order: 2,
          barPercentage: 0.7,
          categoryPercentage: 0.8,
        },
        {
          type: 'bar',
          label: `EBITDA (${unitLabel})`,
          data: ebitdas,
          backgroundColor: ebitdaColors,
          borderColor: ebitdaBorders,
          borderWidth: 1,
          borderRadius: 6,
          borderSkipped: false,
          yAxisID: 'y',
          order: 2,
          barPercentage: 0.7,
          categoryPercentage: 0.8,
        },
        {
          type: 'line',
          label: 'EBITDA Margin %',
          data: margins,
          borderColor: '#f59e0b',
          backgroundColor: marginGradient,
          fill: true,
          pointBackgroundColor: '#fff',
          pointBorderColor: '#f59e0b',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7,
          borderWidth: 2.5,
          tension: 0.4,
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
        legend: CHART_LEGEND,
        tooltip: {
          ...CHART_TOOLTIP,
          callbacks: {
            title: (items) => {
              const r = rows[items[0]?.dataIndex];
              return r ? `${r.period} ${r.periodType === 'PROJECTED' ? '(Projected)' : ''}` : '';
            },
            label(ctx) {
              const v = ctx.raw;
              if (v === null || v === undefined) return '';
              if (ctx.dataset.yAxisID === 'y1') return ` EBITDA Margin: ${Number(v).toFixed(1)}%`;
              return ` ${ctx.dataset.label}: $${Number(v).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 11, family: 'Inter' }, color: '#9ca3af', maxRotation: 45 },
          border: { display: false },
        },
        y: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: unitLabel, font: { size: 11, family: 'Inter', weight: '500' }, color: '#9ca3af' },
          ticks: {
            font: { size: 10, family: 'Inter' },
            color: '#9ca3af',
            callback: v => '$' + Number(v).toLocaleString(),
            padding: 8,
          },
          grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false },
          border: { display: false },
          beginAtZero: true,
        },
        y1: {
          type: 'linear',
          position: 'right',
          title: { display: true, text: 'Margin %', font: { size: 11, family: 'Inter', weight: '500' }, color: '#d97706' },
          ticks: {
            font: { size: 10, family: 'Inter' },
            color: '#d97706',
            callback: v => v + '%',
            padding: 8,
          },
          grid: { drawOnChartArea: false },
          border: { display: false },
        },
      },
    },
  });
}

// ─── Period-over-Period Revenue Growth chart ───────────────────
function renderGrowthChart() {
  let rows = finState.statements
    .filter(s => s.statementType === 'INCOME_STATEMENT')
    .sort((a, b) => a.period.localeCompare(b.period));

  const canvas = document.getElementById('fin-chart-canvas');
  if (!canvas) return;

  if (finState.chartInstance) { finState.chartInstance.destroy(); finState.chartInstance = null; }

  // Filter to avoid mixing annual totals with quarterly data
  rows = filterConsistentPeriods(rows);

  if (rows.length < 2) {
    canvas.parentElement.innerHTML = '<p class="text-xs text-gray-400 text-center py-8">Need at least 2 periods to show growth.</p>';
    return;
  }

  const ctx = canvas.getContext('2d');
  const labels = [];
  const growthData = [];

  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1].lineItems?.revenue;
    const curr = rows[i].lineItems?.revenue;
    if (prev != null && curr != null && prev !== 0) {
      const pct = ((curr - prev) / Math.abs(prev)) * 100;
      labels.push(rows[i].period);
      growthData.push(parseFloat(pct.toFixed(1)));
    }
  }

  if (labels.length === 0) {
    canvas.parentElement.innerHTML = '<p class="text-xs text-gray-400 text-center py-8">No revenue data available for growth calculation.</p>';
    return;
  }

  // Create gradient bars — green for positive, red for negative
  const posGradient = createGradient(ctx, 'rgba(5,150,105,0.85)', 'rgba(5,150,105,0.35)', 280);
  const negGradient = createGradient(ctx, 'rgba(220,38,38,0.85)', 'rgba(220,38,38,0.35)', 280);
  const bgColors = growthData.map(v => v >= 0 ? posGradient : negGradient);
  const borderColors = growthData.map(v => v >= 0 ? 'rgba(5,150,105,0.6)' : 'rgba(220,38,38,0.6)');

  finState.chartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Revenue Growth %',
        data: growthData,
        backgroundColor: bgColors,
        borderColor: borderColors,
        borderWidth: 1,
        borderRadius: 6,
        borderSkipped: false,
        barPercentage: 0.65,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...CHART_TOOLTIP,
          callbacks: {
            title: (items) => items[0]?.label ?? '',
            label: ctx => {
              const v = Number(ctx.raw);
              const sign = v >= 0 ? '+' : '';
              return ` Revenue Growth: ${sign}${v.toFixed(1)}%`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 11, family: 'Inter' }, color: '#9ca3af', maxRotation: 45 },
          border: { display: false },
        },
        y: {
          ticks: {
            font: { size: 10, family: 'Inter' },
            color: '#9ca3af',
            callback: v => (v >= 0 ? '+' : '') + v + '%',
            padding: 8,
          },
          grid: { color: (ctx) => ctx.tick.value === 0 ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.04)', drawBorder: false },
          border: { display: false },
        },
      },
    },
  });
}

// ─── Balance Sheet Composition chart ──────────────────────────
function renderBalanceSheetChart() {
  const rows = finState.statements
    .filter(s => s.statementType === 'BALANCE_SHEET')
    .sort((a, b) => a.period.localeCompare(b.period));

  const canvas = document.getElementById('fin-chart-canvas');
  if (!canvas) return;

  if (finState.chartInstance) { finState.chartInstance.destroy(); finState.chartInstance = null; }

  if (rows.length === 0) {
    canvas.parentElement.innerHTML = '<p class="text-xs text-gray-400 text-center py-8">No balance sheet data available.</p>';
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
        { label: 'Cash', data: rows.map(r => li(r, 'cash')), backgroundColor: '#003366', stack: 'assets', borderWidth: 0, borderRadius: 3 },
        { label: 'Receivables', data: rows.map(r => li(r, 'accounts_receivable')), backgroundColor: '#2563eb', stack: 'assets', borderWidth: 0, borderRadius: 3 },
        { label: 'Inventory', data: rows.map(r => li(r, 'inventory')), backgroundColor: '#60a5fa', stack: 'assets', borderWidth: 0, borderRadius: 3 },
        { label: 'PP&E', data: rows.map(r => li(r, 'ppe_net')), backgroundColor: '#93c5fd', stack: 'assets', borderWidth: 0, borderRadius: 3 },
        { label: 'Goodwill + Intangibles', data: rows.map(r => (li(r, 'goodwill') || 0) + (li(r, 'intangibles') || 0)), backgroundColor: '#bfdbfe', stack: 'assets', borderWidth: 0, borderRadius: 3 },
        { label: 'Current Liab.', data: rows.map(r => li(r, 'total_current_liabilities')), backgroundColor: '#dc2626', stack: 'liabilities', borderWidth: 0, borderRadius: 3 },
        { label: 'LT Debt', data: rows.map(r => li(r, 'long_term_debt')), backgroundColor: '#f87171', stack: 'liabilities', borderWidth: 0, borderRadius: 3 },
        { label: 'Equity', data: rows.map(r => li(r, 'total_equity')), backgroundColor: '#059669', stack: 'liabilities', borderWidth: 0, borderRadius: 3 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          ...CHART_LEGEND,
          labels: { ...CHART_LEGEND.labels, font: { size: 10, family: 'Inter', weight: '500' }, boxWidth: 10, padding: 12 },
        },
        tooltip: {
          ...CHART_TOOLTIP,
          callbacks: {
            label: ctx => {
              const v = ctx.raw;
              if (!v) return '';
              return ` ${ctx.dataset.label}: $${Number(v).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}${unitLabel.replace('$', '')}`;
            },
          },
        },
        title: {
          display: true,
          text: 'Assets  vs  Liabilities + Equity',
          font: { size: 11, family: 'Inter', weight: '500' },
          color: '#9ca3af',
          padding: { bottom: 8 },
        },
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: { font: { size: 11, family: 'Inter' }, color: '#9ca3af' },
          border: { display: false },
        },
        y: {
          stacked: true,
          title: { display: true, text: unitLabel, font: { size: 11, family: 'Inter', weight: '500' }, color: '#9ca3af' },
          ticks: {
            font: { size: 10, family: 'Inter' },
            color: '#9ca3af',
            callback: v => '$' + Number(v).toLocaleString(),
            padding: 8,
          },
          grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false },
          border: { display: false },
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
