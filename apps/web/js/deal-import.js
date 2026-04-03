// Deal Import — AI-powered bulk import from CSV/Excel/pasted text
// Depends on: auth.js (PEAuth), config.js (API_BASE_URL), formatters.js (escapeHtml), notifications.js (showNotification)

let importState = {
  file: null,
  source: null,        // 'csv' | 'excel' | 'paste'
  mapping: {},          // column mapping from AI
  allRows: [],          // all parsed rows from server
  mappedDeals: [],      // deals after applying mapping
  currentTab: 'upload', // 'upload' | 'paste'
};

// ============================================
// Modal Controls
// ============================================

function openDealImportModal() {
  resetDealImport();
  document.getElementById('deal-import-modal').classList.remove('hidden');
}

function closeDealImportModal() {
  document.getElementById('deal-import-modal').classList.add('hidden');
}

function resetDealImport() {
  importState = { file: null, source: null, mapping: {}, allRows: [], mappedDeals: [], currentTab: 'upload' };
  goToImportStep(1);
  document.getElementById('import-paste-area').value = '';
  document.getElementById('import-file-name').classList.add('hidden');
  document.getElementById('import-upload-error').classList.add('hidden');
  document.getElementById('deal-import-file').value = '';
  document.getElementById('import-result-errors').classList.add('hidden');
  document.getElementById('import-result-errors').innerHTML = '';
  switchImportTab('upload');
}

// ============================================
// Tab Switching
// ============================================

function switchImportTab(tab) {
  importState.currentTab = tab;
  const uploadTab = document.getElementById('tab-upload');
  const pasteTab = document.getElementById('tab-paste');
  const uploadContent = document.getElementById('upload-tab-content');
  const pasteContent = document.getElementById('paste-tab-content');

  if (tab === 'upload') {
    uploadTab.style.background = '#003366';
    uploadTab.style.color = 'white';
    pasteTab.style.background = '';
    pasteTab.style.color = '';
    pasteTab.className = 'px-4 py-2 text-sm font-medium rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200';
    uploadContent.classList.remove('hidden');
    pasteContent.classList.add('hidden');
  } else {
    pasteTab.style.background = '#003366';
    pasteTab.style.color = 'white';
    uploadTab.style.background = '';
    uploadTab.style.color = '';
    uploadTab.className = 'px-4 py-2 text-sm font-medium rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200';
    pasteContent.classList.remove('hidden');
    uploadContent.classList.add('hidden');
  }
}

// ============================================
// Step Navigation
// ============================================

function goToImportStep(step) {
  for (let i = 1; i <= 4; i++) {
    document.getElementById(`import-step-${i}`).classList.toggle('hidden', i !== step);
    const ind = document.getElementById(`step-ind-${i}`);
    if (i === step) {
      ind.style.background = '#003366';
      ind.style.color = 'white';
      ind.className = 'px-2 py-1 rounded';
    } else if (i < step) {
      ind.style.background = '#e2e8f0';
      ind.style.color = '#003366';
      ind.className = 'px-2 py-1 rounded';
    } else {
      ind.style.background = '';
      ind.style.color = '';
      ind.className = 'px-2 py-1 rounded bg-slate-100';
    }
  }
}

// ============================================
// File Handling
// ============================================

function handleDealImportFile(file) {
  if (!file) return;

  const ext = file.name.split('.').pop().toLowerCase();
  if (!['csv', 'xlsx'].includes(ext)) {
    showImportError('Please select a CSV or Excel (.xlsx) file.');
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showImportError('File too large. Maximum 5MB.');
    return;
  }

  importState.file = file;
  importState.source = ext === 'xlsx' ? 'excel' : 'csv';

  document.getElementById('import-file-name').classList.remove('hidden');
  document.getElementById('import-file-label').textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
  document.getElementById('import-upload-error').classList.add('hidden');
}

function clearDealImportFile() {
  importState.file = null;
  importState.source = null;
  document.getElementById('import-file-name').classList.add('hidden');
  document.getElementById('deal-import-file').value = '';
}

function showImportError(msg) {
  const el = document.getElementById('import-upload-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

// ============================================
// Step 1 → Step 2: Analyze
// ============================================

async function analyzeDealImport() {
  const btn = document.getElementById('import-analyze-btn');
  const origHTML = btn.innerHTML;

  try {
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined text-[18px] animate-spin">sync</span> AI is analyzing...';

    let res;

    if (importState.currentTab === 'paste') {
      const text = document.getElementById('import-paste-area').value.trim();
      if (!text) {
        showImportError('Please paste your deal data first.');
        return;
      }
      importState.source = 'paste';
      res = await PEAuth.authFetch(`${API_BASE_URL}/deals/import/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'paste', rawData: text }),
      });
    } else if (importState.source === 'excel' && importState.file) {
      const formData = new FormData();
      formData.append('file', importState.file);
      formData.append('source', 'excel');
      res = await PEAuth.authFetch(`${API_BASE_URL}/deals/import/analyze`, {
        method: 'POST',
        body: formData,
      });
    } else if (importState.file) {
      // CSV — read as text
      const text = await importState.file.text();
      res = await PEAuth.authFetch(`${API_BASE_URL}/deals/import/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'csv', rawData: text }),
      });
    } else {
      showImportError('Please upload a file or paste data first.');
      return;
    }

    const data = await res.json();
    if (!res.ok || !data.success) {
      showImportError(data.error || 'Analysis failed. Please try again.');
      return;
    }

    importState.mapping = data.mapping;
    importState.allRows = data.allRows;

    renderMappingUI(data);
    goToImportStep(2);

  } catch (err) {
    console.error('Analyze error:', err);
    showImportError('Failed to analyze data. Please try again.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = origHTML;
  }
}

// ============================================
// Step 2: Column Mapping UI
// ============================================

const DEAL_FIELDS = [
  { value: 'name', label: 'Deal Name' },
  { value: 'companyName', label: 'Company Name' },
  { value: 'stage', label: 'Stage' },
  { value: 'status', label: 'Status' },
  { value: 'dealSize', label: 'Deal Size ($)' },
  { value: 'ebitda', label: 'EBITDA ($)' },
  { value: 'revenue', label: 'Revenue ($)' },
  { value: 'irrProjected', label: 'IRR (%)' },
  { value: 'mom', label: 'MoM Multiple' },
  { value: 'industry', label: 'Industry' },
  { value: 'description', label: 'Description' },
  { value: 'priority', label: 'Priority' },
  { value: 'tags', label: 'Tags' },
  { value: 'targetCloseDate', label: 'Target Close Date' },
  { value: 'source', label: 'Source' },
];

function renderMappingUI(data) {
  const container = document.getElementById('mapping-container');
  const headers = Object.keys(data.mapping);

  container.innerHTML = headers.map(header => {
    const m = data.mapping[header];
    const isCustom = m.field.startsWith('customFields.');
    const confidence = m.confidence;
    const sample = data.preview[0]?.original[header] || '';

    let colorClass, colorBg;
    if (isCustom) {
      colorClass = 'text-amber-700';
      colorBg = 'bg-amber-50 border-amber-200';
    } else if (confidence >= 0.8) {
      colorClass = 'text-emerald-700';
      colorBg = 'bg-emerald-50 border-emerald-200';
    } else {
      colorClass = 'text-amber-700';
      colorBg = 'bg-amber-50 border-amber-200';
    }

    const options = DEAL_FIELDS.map(f =>
      `<option value="${f.value}" ${m.field === f.value ? 'selected' : ''}>${f.label}</option>`
    ).join('');

    const customKey = isCustom ? m.field.replace('customFields.', '') : header.replace(/[^a-zA-Z0-9]/g, '').replace(/^./, c => c.toLowerCase());

    return `
      <div class="flex items-center gap-3 p-3 rounded-lg border ${colorBg}">
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium text-slate-900">${escapeHtml(header)}</div>
          <div class="text-xs text-slate-400 truncate">e.g., "${escapeHtml(sample)}"</div>
        </div>
        <span class="material-symbols-outlined text-slate-400 text-[18px]">arrow_forward</span>
        <div class="flex-1">
          <select data-source-col="${escapeHtml(header)}" onchange="updateMapping(this)"
            class="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300">
            ${options}
            <option value="custom" ${isCustom ? 'selected' : ''}>Custom Field</option>
            <option value="skip">Skip</option>
          </select>
          ${isCustom ? `<div class="mt-1 text-xs ${colorClass}">→ custom field: "${escapeHtml(customKey)}"</div>` : ''}
        </div>
        <div class="text-xs font-medium ${colorClass} w-12 text-right">${Math.round(confidence * 100)}%</div>
      </div>
    `;
  }).join('');

  // Show warnings
  if (data.warnings && data.warnings.length > 0) {
    container.innerHTML += `
      <div class="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
        <div class="text-sm font-medium text-amber-800 mb-1">Warnings</div>
        ${data.warnings.map(w => `<div class="text-xs text-amber-700">• ${escapeHtml(w)}</div>`).join('')}
      </div>
    `;
  }
}

function updateMapping(select) {
  const sourceCol = select.dataset.sourceCol;
  const value = select.value;

  if (value === 'skip') {
    delete importState.mapping[sourceCol];
  } else if (value === 'custom') {
    const key = sourceCol.replace(/[^a-zA-Z0-9]/g, '').replace(/^./, c => c.toLowerCase());
    importState.mapping[sourceCol] = { field: `customFields.${key}`, confidence: 1.0 };
  } else {
    importState.mapping[sourceCol] = { ...importState.mapping[sourceCol], field: value };
  }
}

// ============================================
// Step 2 → Step 3: Apply Mapping & Preview
// SYNC: Transform logic duplicated from dealImportMapper.ts — keep both in sync
// ============================================

function applyMappingAndPreview() {
  const VALID_STAGES = ['INITIAL_REVIEW', 'DUE_DILIGENCE', 'IOI_SUBMITTED', 'LOI_SUBMITTED', 'NEGOTIATION', 'CLOSING', 'PASSED', 'CLOSED_WON', 'CLOSED_LOST'];
  const VALID_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

  importState.mappedDeals = importState.allRows.map(row => {
    const deal = { customFields: {} };

    for (const [sourceCol, value] of Object.entries(row)) {
      const m = importState.mapping[sourceCol];
      if (!m) continue;

      let transformed = value;
      if (m.transform === 'multiply_1000000') { const n = parseFloat(String(value).replace(/[$€£,]/g, '')) * 1000000; transformed = isNaN(n) ? null : n; }
      else if (m.transform === 'multiply_1000000000') { const n = parseFloat(String(value).replace(/[$€£,]/g, '')) * 1000000000; transformed = isNaN(n) ? null : n; }
      else if (m.transform === 'percentage_to_decimal') { const n = parseFloat(String(value).replace(/%/g, '')) / 100; transformed = isNaN(n) ? null : n; }
      else if (m.transform === 'strip_x_suffix') { const n = parseFloat(String(value).replace(/x$/i, '')); transformed = isNaN(n) ? null : n; }

      if (transformed === null || transformed === '') continue;

      if (m.field.startsWith('customFields.')) {
        deal.customFields[m.field.replace('customFields.', '')] = transformed;
      } else {
        deal[m.field] = transformed;
      }
    }

    // Normalize enums
    if (deal.stage) {
      const upper = String(deal.stage).toUpperCase().replace(/[\s-]/g, '_');
      deal.stage = VALID_STAGES.includes(upper) ? upper : 'INITIAL_REVIEW';
    }
    if (deal.priority) {
      const upper = String(deal.priority).toUpperCase();
      deal.priority = VALID_PRIORITIES.includes(upper) ? upper : 'MEDIUM';
    }

    // Numeric fields
    for (const f of ['dealSize', 'ebitda', 'revenue', 'irrProjected', 'mom']) {
      if (deal[f] !== undefined && deal[f] !== null && typeof deal[f] === 'string') {
        const num = parseFloat(String(deal[f]).replace(/[$€£,%x,]/g, ''));
        deal[f] = isNaN(num) ? null : num;
      }
    }

    // Auto-generate name from company if missing
    if (!deal.name && deal.companyName) deal.name = deal.companyName;

    return deal;
  });

  // Count valid/invalid
  const valid = importState.mappedDeals.filter(d => d.companyName || d.name).length;
  const invalid = importState.mappedDeals.length - valid;

  // Render preview
  const summaryEl = document.getElementById('preview-summary');
  summaryEl.innerHTML = `
    <span class="font-medium text-slate-900">${importState.mappedDeals.length} deals found</span>
    <span class="mx-2 text-slate-300">·</span>
    <span class="text-emerald-600 font-medium">${valid} valid</span>
    ${invalid > 0 ? `<span class="mx-2 text-slate-300">·</span><span class="text-red-500 font-medium">${invalid} have issues</span>` : ''}
  `;

  // Table headers — show mapped field names
  const mappedFields = [...new Set(Object.values(importState.mapping).map(m => m.field).filter(f => !f.startsWith('customFields.')))];
  const displayFields = mappedFields.slice(0, 8); // Show max 8 columns

  const thead = document.getElementById('preview-thead');
  thead.innerHTML = `<tr>${displayFields.map(f => {
    const label = DEAL_FIELDS.find(df => df.value === f)?.label || f;
    return `<th class="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase">${escapeHtml(label)}</th>`;
  }).join('')}</tr>`;

  const tbody = document.getElementById('preview-tbody');
  const previewRows = importState.mappedDeals.slice(0, 50);
  tbody.innerHTML = previewRows.map((deal, i) => {
    const hasIssue = !deal.companyName && !deal.name;
    const rowClass = hasIssue ? 'bg-red-50' : (i % 2 === 0 ? 'bg-white' : 'bg-slate-50');
    return `<tr class="${rowClass} border-b border-slate-100">${displayFields.map(f => {
      let val = deal[f];
      if (val === null || val === undefined) val = '—';
      else if (typeof val === 'number' && ['dealSize', 'ebitda', 'revenue'].includes(f)) {
        val = '$' + Number(val).toLocaleString();
      } else if (typeof val === 'number' && f === 'irrProjected') {
        val = (val * 100).toFixed(1) + '%';
      } else if (typeof val === 'number' && f === 'mom') {
        val = val.toFixed(1) + 'x';
      }
      return `<td class="px-3 py-2 text-sm text-slate-700 whitespace-nowrap">${escapeHtml(String(val))}</td>`;
    }).join('')}</tr>`;
  }).join('');

  if (importState.mappedDeals.length > 50) {
    tbody.innerHTML += `<tr><td colspan="${displayFields.length}" class="px-3 py-2 text-xs text-slate-400 text-center">...and ${importState.mappedDeals.length - 50} more rows</td></tr>`;
  }

  // Update submit button label
  document.getElementById('import-submit-label').textContent = `Import ${valid} Deals`;

  goToImportStep(3);
}

// ============================================
// Step 3 → Step 4: Submit Import
// ============================================

async function submitDealImport() {
  const btn = document.getElementById('import-submit-btn');
  const origHTML = btn.innerHTML;

  // Filter to valid deals only
  const validDeals = importState.mappedDeals.filter(d => d.companyName || d.name);

  try {
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined text-[18px] animate-spin">sync</span> Importing...';

    const res = await PEAuth.authFetch(`${API_BASE_URL}/deals/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deals: validDeals }),
    });

    const data = await res.json();

    // Show result
    goToImportStep(4);

    if (data.imported > 0) {
      document.getElementById('import-result-icon').textContent = 'check_circle';
      document.getElementById('import-result-icon').style.color = '#059669';
      document.getElementById('import-result-title').textContent = `${data.imported} deals imported successfully!`;

      let detail = '';
      if (data.companiesCreated > 0) detail += `${data.companiesCreated} new companies created. `;
      if (data.failed > 0) detail += `${data.failed} rows failed.`;
      document.getElementById('import-result-detail').textContent = detail || 'All deals imported successfully.';
    } else {
      document.getElementById('import-result-icon').textContent = 'error';
      document.getElementById('import-result-icon').style.color = '#ef4444';
      document.getElementById('import-result-title').textContent = 'Import failed';
      document.getElementById('import-result-detail').textContent = 'No deals could be imported.';
    }

    // Show errors if any
    if (data.errors && data.errors.length > 0) {
      const errContainer = document.getElementById('import-result-errors');
      errContainer.classList.remove('hidden');
      errContainer.innerHTML = `
        <div class="p-3 bg-red-50 border border-red-200 rounded-lg">
          <div class="text-sm font-medium text-red-800 mb-2">Failed Rows</div>
          ${data.errors.map(e => `<div class="text-xs text-red-600 mb-1">Row ${e.row}: ${escapeHtml(e.reason)}</div>`).join('')}
        </div>
      `;
    }

    if (data.imported > 0) {
      showNotification('Deal Import', `${data.imported} deals imported successfully`, 'success');
    }

  } catch (err) {
    console.error('Import error:', err);
    goToImportStep(4);
    document.getElementById('import-result-icon').textContent = 'error';
    document.getElementById('import-result-icon').style.color = '#ef4444';
    document.getElementById('import-result-title').textContent = 'Import failed';
    document.getElementById('import-result-detail').textContent = 'An unexpected error occurred. Please try again.';
  } finally {
    btn.disabled = false;
    btn.innerHTML = origHTML;
  }
}
