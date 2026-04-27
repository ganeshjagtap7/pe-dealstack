/**
 * financials-helpers.js — Constants, formatters, and badge/popup functions for Financial Dashboard
 * Extracted from financials.js. Must be loaded BEFORE financials.js.
 * Depends on: escapeHtml (formatters.js)
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

// ─── Formatters ───────────────────────────────────────────────
function fmtMoney(val, unitScale, currency) {
  if (val === null || val === undefined) return '—';
  const n = Number(val);
  if (isNaN(n)) return '—';
  const sym = getCurrencySymbol(currency);
  const code = (currency || 'USD').toUpperCase();
  // For INR with MILLIONS unitScale, show in Cr (1 Cr = 10M, so divide by 10)
  if (code === 'INR' && unitScale === 'MILLIONS') {
    const crores = n / 10;
    return sym + crores.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + 'Cr';
  }
  if (code === 'INR' && unitScale === 'THOUSANDS') {
    const lakhs = n / 100;
    return sym + lakhs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + 'L';
  }
  const suffix = unitScale === 'MILLIONS' ? 'M' : unitScale === 'THOUSANDS' ? 'K' : '';
  return sym + n.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + suffix;
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

// ─── Cell Trust Helpers ──────────────────────────────────────

/**
 * Determine trust tier for a table cell based on confidence and source citation.
 * @param {number|null} confidence - extraction confidence (0-100)
 * @param {string|null} sourceQuote - the _source citation string
 * @returns {{ tier: 'verified'|'review'|'unverified', bg: string }}
 */
function getCellTrustTier(confidence, sourceQuote) {
  const conf = confidence ?? 0;
  const hasSource = sourceQuote && typeof sourceQuote === 'string' && sourceQuote.length > 0;
  if (conf >= 80 && hasSource) return { tier: 'verified', bg: '' };
  if (conf < 60) return { tier: 'unverified', bg: '#FEF2F2' };
  return { tier: 'review', bg: '#FFFBEB' };
}

/**
 * Build data attributes for cell tooltip.
 */
function cellTooltipAttrs(key, lineItems, confidence, extractionSource, docName) {
  const source = lineItems[key + '_source'] ?? null;
  const conf = confidence ?? 0;
  const method = extractionSource ?? 'gpt4o';
  const doc = docName ?? '';
  const s = source ? escapeHtml(source) : '';
  return `data-tip-source="${s}" data-tip-conf="${conf}" data-tip-method="${method}" data-tip-doc="${escapeHtml(doc)}"`;
}

/**
 * Show a tooltip near a table cell with source citation info.
 */
function showCellTooltip(event) {
  hideCellTooltip();
  const td = event.currentTarget;
  const source = td.getAttribute('data-tip-source');
  const conf = td.getAttribute('data-tip-conf');
  const method = td.getAttribute('data-tip-method');
  const doc = td.getAttribute('data-tip-doc');

  const hasSource = source && source.length > 0;
  const confNum = parseInt(conf) || 0;

  const tip = document.createElement('div');
  tip.id = 'fin-cell-tooltip';
  tip.style.cssText = 'position:fixed;z-index:9999;max-width:320px;padding:10px 14px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.12);font-size:11px;line-height:1.5;color:#374151;pointer-events:none;';

  if (hasSource) {
    tip.innerHTML = `
      <div style="color:#1f2937;font-weight:600;margin-bottom:6px;display:flex;align-items:center;gap:4px;">
        <span class="material-symbols-outlined" style="font-size:13px;color:#059669;">verified</span> Source Citation
      </div>
      <div style="color:#4b5563;font-style:italic;margin-bottom:8px;padding:6px 8px;background:#f9fafb;border-radius:4px;border-left:3px solid #003366;">"${source}"</div>
      <div style="color:#9ca3af;font-size:10px;">Confidence: <strong style="color:#374151;">${conf}%</strong> &middot; ${method.toUpperCase()} &middot; ${doc}</div>`;
  } else {
    tip.innerHTML = `
      <div style="color:#92400e;font-weight:600;margin-bottom:6px;display:flex;align-items:center;gap:4px;">
        <span class="material-symbols-outlined" style="font-size:13px;color:#d97706;">warning</span> No Source Citation
      </div>
      <div style="color:#78716c;margin-bottom:8px;">This value was inferred by AI but could not be traced to a specific location in the document. Verify manually.</div>
      <div style="color:#9ca3af;font-size:10px;">Confidence: <strong style="color:#374151;">${conf}%</strong> &middot; ${method.toUpperCase()}</div>`;
  }

  document.body.appendChild(tip);

  // Position near cell
  const rect = td.getBoundingClientRect();
  let left = rect.left + rect.width / 2 - tip.offsetWidth / 2;
  let top = rect.top - tip.offsetHeight - 8;
  if (top < 8) top = rect.bottom + 8;
  if (left < 8) left = 8;
  if (left + tip.offsetWidth > window.innerWidth - 8) left = window.innerWidth - tip.offsetWidth - 8;
  tip.style.left = left + 'px';
  tip.style.top = top + 'px';
}

function hideCellTooltip() {
  document.getElementById('fin-cell-tooltip')?.remove();
}

/** Trust legend HTML — inserted above the table */
function trustLegendHtml() {
  return `<div class="flex items-center gap-4 text-[10px] text-gray-500 mb-2 px-1">
    <span class="flex items-center gap-1"><span style="width:7px;height:7px;border-radius:50%;background:#059669;display:inline-block;"></span> Verified (80%+)</span>
    <span class="flex items-center gap-1"><span style="width:7px;height:7px;border-radius:50%;background:#d97706;display:inline-block;"></span> Review suggested</span>
    <span class="flex items-center gap-1"><span style="width:7px;height:7px;border-radius:50%;background:#dc2626;display:inline-block;"></span> Unverified</span>
  </div>`;
}
