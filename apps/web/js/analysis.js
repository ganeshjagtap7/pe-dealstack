/**
 * Financial Analysis Module — Premium Tabbed Dashboard
 * PE-grade financial intelligence with institutional styling
 * Constants & CSS loaded from js/analysis-styles.js
 */

/* global PEAuth, API_BASE_URL, Chart, BANKER_BLUE, BANKER_BLUE_LIGHT, BANKER_BLUE_MUTED, CHART_PALETTE, SEVERITY_STYLES, TABS, injectAnalysisStyles */

// ─── State ──────────────────────────────────────────────────

const analysisState = {
  data: null,
  activeTab: 'overview',
  activeRatioGroup: 0,
  chartInstances: [],
};

// ─── Main Load Function ─────────────────────────────────────

async function loadAnalysis(dealId) {
  const section = document.getElementById('analysis-section');
  if (!section) return;

  injectAnalysisStyles();

  try {
    const res = await PEAuth.authFetch(`${API_BASE_URL}/deals/${dealId}/financials/analysis`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    if (!data.hasData) {
      section.style.display = 'none';
      return;
    }

    // Load supplementary data in parallel
    const [crossDocRes, benchmarkRes, memoRes, insightsRes] = await Promise.allSettled([
      PEAuth.authFetch(`${API_BASE_URL}/deals/${dealId}/financials/cross-doc`),
      PEAuth.authFetch(`${API_BASE_URL}/deals/${dealId}/financials/benchmark`),
      PEAuth.authFetch(`${API_BASE_URL}/deals/${dealId}/financials/memo`),
      PEAuth.authFetch(`${API_BASE_URL}/deals/${dealId}/financials/insights`),
    ]);

    if (crossDocRes.status === 'fulfilled' && crossDocRes.value.ok)
      data.crossDoc = await crossDocRes.value.json();
    if (benchmarkRes.status === 'fulfilled' && benchmarkRes.value.ok)
      data.benchmark = await benchmarkRes.value.json();
    if (memoRes.status === 'fulfilled' && memoRes.value.ok)
      data.memo = await memoRes.value.json();
    if (insightsRes.status === 'fulfilled' && insightsRes.value.ok) {
      const insightsData = await insightsRes.value.json();
      data.insights = insightsData.insights;
    }

    analysisState.data = data;
    section.style.display = 'block';

    renderScoreBadge(data.qoe);
    renderDashboard(data);
  } catch (err) {
    console.error('Failed to load analysis:', err);
    section.style.display = 'none';
  }
}

// ─── Score Badge ────────────────────────────────────────────

function renderScoreBadge(qoe) {
  const badge = document.getElementById('qoe-score-badge');
  if (!badge || !qoe) return;

  const s = qoe.score;
  let bg, color;
  if (s >= 75) { bg = '#D1FAE5'; color = '#059669'; }
  else if (s >= 50) { bg = '#FEF3C7'; color = '#d97706'; }
  else { bg = '#FEE2E2'; color = '#dc2626'; }

  badge.style.display = 'inline-flex';
  badge.innerHTML = `<span style="background:${bg};color:${color};padding:3px 12px;border-radius:20px;font-size:11px;font-weight:700;">QoE: ${s}/100</span>`;
}

// ─── Dashboard Shell with Tabs ──────────────────────────────

function renderDashboard(data) {
  const container = document.getElementById('analysis-content');
  if (!container) return;

  // Destroy old charts
  analysisState.chartInstances.forEach(c => c.destroy());
  analysisState.chartInstances = [];

  // Count items per tab for badges
  const flagCount = (data.qoe?.flags?.length || 0) + (data.redFlags?.length || 0);
  const conflictCount = data.crossDoc?.conflicts?.length || 0;

  container.innerHTML = `
    <!-- Tab Bar -->
    <div style="display:flex;gap:0;border-bottom:2px solid #E5E7EB;margin-bottom:20px;overflow-x:auto;">
      ${TABS.map(t => {
        let badgeHtml = '';
        if (t.id === 'diligence' && flagCount > 0) {
          badgeHtml = `<span style="background:#dc2626;color:#fff;font-size:9px;font-weight:700;padding:1px 6px;border-radius:10px;min-width:16px;text-align:center;">${flagCount}</span>`;
        }
        if (t.id === 'diligence' && conflictCount > 0) {
          badgeHtml += `<span style="background:#d97706;color:#fff;font-size:9px;font-weight:700;padding:1px 6px;border-radius:10px;min-width:16px;text-align:center;">${conflictCount}</span>`;
        }
        return `<button class="analysis-tab ${t.id === 'overview' ? 'active' : ''}"
          onclick="switchAnalysisTab('${t.id}')" id="atab-${t.id}">
          <span class="material-symbols-outlined">${t.icon}</span>
          ${t.label}
          ${badgeHtml}
        </button>`;
      }).join('')}
    </div>

    <!-- Tab Panels -->
    <div id="analysis-panels">
      <div id="apanel-overview" class="analysis-panel active analysis-tab-content">
        ${renderOverviewTab(data)}
      </div>
      <div id="apanel-deepdive" class="analysis-panel">
        ${renderDeepDiveTab(data)}
      </div>
      <div id="apanel-cashcap" class="analysis-panel">
        ${renderCashCapitalTab(data)}
      </div>
      <div id="apanel-valuation" class="analysis-panel">
        ${renderValuationTab(data)}
      </div>
      <div id="apanel-diligence" class="analysis-panel">
        ${renderDiligenceTab(data)}
      </div>
      <div id="apanel-aiinsights" class="analysis-panel">
        ${renderAIInsightsTab(data)}
      </div>
      <div id="apanel-memo" class="analysis-panel">
        ${renderMemoTab(data)}
      </div>
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding-top:10px;border-top:1px solid #F1F5F9;">
      <span style="font-size:10px;color:#94A3B8;">Analyzed ${data.periods?.length || 0} period${(data.periods?.length || 0) !== 1 ? 's' : ''}</span>
      <span style="font-size:10px;color:#94A3B8;">${new Date(data.analyzedAt).toLocaleString()}</span>
    </div>
  `;

  // Render charts after DOM ready
  setTimeout(() => renderRatioCharts(data.ratios, data.periods), 80);
}

// ─── Tab Switching ──────────────────────────────────────────

function switchAnalysisTab(tabId) {
  analysisState.activeTab = tabId;

  // Update tab buttons
  TABS.forEach(t => {
    const btn = document.getElementById(`atab-${t.id}`);
    if (btn) btn.classList.toggle('active', t.id === tabId);
  });

  // Update panels
  TABS.forEach(t => {
    const panel = document.getElementById(`apanel-${t.id}`);
    if (panel) {
      const isActive = t.id === tabId;
      panel.classList.toggle('active', isActive);
      if (isActive) panel.classList.add('analysis-tab-content');
    }
  });

  // Re-render charts if switching to deep dive
  if (tabId === 'deepdive') {
    const data = analysisState.data;
    if (data) setTimeout(() => renderSingleRatioChart(analysisState.activeRatioGroup, data.ratios[analysisState.activeRatioGroup], data.periods), 50);
  }
}

// ─── Tab: Overview ──────────────────────────────────────────

function renderOverviewTab(data) {
  const qoe = data.qoe;
  // Quick stats from latest period
  const stats = [];
  if (data.revenueQuality?.revenueCAGR != null) stats.push({ label: 'Revenue CAGR', value: data.revenueQuality.revenueCAGR + '%', color: data.revenueQuality.revenueCAGR >= 0 ? '#059669' : '#dc2626' });
  if (data.cashFlowAnalysis?.avgConversion != null) stats.push({ label: 'FCF Conversion', value: data.cashFlowAnalysis.avgConversion + '%', color: data.cashFlowAnalysis.avgConversion >= 60 ? '#059669' : '#d97706' });
  if (data.debtCapacity?.currentLeverage != null) stats.push({ label: 'Net Leverage', value: data.debtCapacity.currentLeverage + 'x', color: data.debtCapacity.currentLeverage <= 3 ? '#059669' : '#d97706' });
  if (data.lboScreen?.passesScreen != null) stats.push({ label: 'LBO Screen', value: data.lboScreen.passesScreen ? 'Pass' : 'Fail', color: data.lboScreen.passesScreen ? '#059669' : '#dc2626' });

  return `
    <!-- QoE Score Hero -->
    <div class="analysis-card analysis-slide-up" style="background:linear-gradient(135deg,#FAFBFF 0%,#F0F4FA 100%);border:1px solid #D6DEE8;">
      <div style="display:flex;gap:24px;align-items:center;flex-wrap:wrap;">
        <!-- Score Ring -->
        ${qoe ? renderScoreRing(qoe.score) : ''}

        <!-- Summary -->
        <div style="flex:1;min-width:200px;">
          <div style="font-size:14px;font-weight:700;color:#111827;margin-bottom:6px;">Quality of Earnings Assessment</div>
          <p style="font-size:12px;color:#475569;line-height:1.6;margin-bottom:12px;">${qoe ? esc(qoe.summary) : 'No assessment available.'}</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${qoe ? renderSeverityCounts(qoe.flags) : ''}
          </div>
        </div>

        <!-- Quick Stats -->
        ${stats.length > 0 ? `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;min-width:180px;">
            ${stats.map(s => `
              <div style="background:#fff;border:1px solid #E2E8F0;border-radius:8px;padding:10px 12px;">
                <div style="font-size:9px;color:#64748B;text-transform:uppercase;font-weight:600;">${s.label}</div>
                <div style="font-size:18px;font-weight:800;color:${s.color};">${s.value}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    </div>

    <!-- QoE Flags -->
    ${qoe && qoe.flags.length > 0 ? `
      <div class="analysis-card analysis-fade-in" style="animation-delay:0.1s;">
        <div class="analysis-card-header">
          <span class="material-symbols-outlined">flag</span>
          <span class="analysis-card-title">Key Findings</span>
          <span class="analysis-badge" style="background:#FEE2E2;color:#dc2626;">${qoe.flags.filter(f => f.severity === 'critical').length} Critical</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${qoe.flags.map(f => renderFlagCard(f)).join('')}
        </div>
      </div>
    ` : ''}

    <!-- EBITDA Bridge -->
    ${data.ebitdaBridge ? renderEBITDABridge(data.ebitdaBridge) : ''}

    <!-- Revenue Quality -->
    ${data.revenueQuality ? renderRevenueQuality(data.revenueQuality) : ''}
  `;
}

function renderScoreRing(score) {
  let ringColor, ringBg, label;
  if (score >= 75) { ringColor = '#059669'; ringBg = '#ECFDF5'; label = 'Strong'; }
  else if (score >= 50) { ringColor = '#d97706'; ringBg = '#FFFBEB'; label = 'Moderate'; }
  else { ringColor = '#dc2626'; ringBg = '#FEF2F2'; label = 'Weak'; }

  const circumference = 2 * Math.PI * 40;
  const dashOffset = circumference * (1 - score / 100);

  return `
    <div style="flex-shrink:0;position:relative;width:96px;height:96px;">
      <svg width="96" height="96" viewBox="0 0 96 96" style="transform:rotate(-90deg);">
        <circle cx="48" cy="48" r="40" fill="${ringBg}" stroke="#E5E7EB" stroke-width="5"/>
        <circle cx="48" cy="48" r="40" fill="none" stroke="${ringColor}" stroke-width="5"
          stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}"
          stroke-linecap="round" style="transition:stroke-dashoffset 1s ease-out;"/>
      </svg>
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">
        <span style="font-size:28px;font-weight:800;color:${ringColor};line-height:1;">${score}</span>
        <span style="font-size:9px;font-weight:700;color:${ringColor};text-transform:uppercase;letter-spacing:0.05em;">${label}</span>
      </div>
    </div>
  `;
}

function renderSeverityCounts(flags) {
  const counts = { critical: 0, warning: 0, positive: 0, info: 0 };
  flags.forEach(f => { if (counts[f.severity] !== undefined) counts[f.severity]++; });

  return Object.entries(counts)
    .filter(([, c]) => c > 0)
    .map(([sev, count]) => {
      const s = SEVERITY_STYLES[sev];
      const icons = { critical: 'error', warning: 'warning', positive: 'check_circle', info: 'info' };
      const labels = { critical: 'Critical', warning: 'Warning', positive: 'Positive', info: 'Info' };
      return `<span class="analysis-badge" style="background:${s.badgeBg};color:${s.badge};">
        <span class="material-symbols-outlined" style="font-size:13px;">${icons[sev]}</span>
        ${count} ${labels[sev]}
      </span>`;
    }).join('');
}

function renderFlagCard(flag) {
  const s = SEVERITY_STYLES[flag.severity] || SEVERITY_STYLES.info;
  return `
    <div class="analysis-flag" style="background:${s.bg};border-color:${s.border};">
      <span class="material-symbols-outlined" style="font-size:18px;color:${s.icon};flex-shrink:0;margin-top:1px;">${flag.icon}</span>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;">
          <span style="font-size:12px;font-weight:700;color:${s.text};">${esc(flag.title)}</span>
          ${flag.metric ? `<span style="font-size:10px;font-weight:600;color:${s.icon};background:rgba(255,255,255,0.7);padding:2px 8px;border-radius:6px;">${flag.metric}</span>` : ''}
          <span style="font-size:10px;color:${s.text};opacity:0.5;margin-left:auto;">${flag.category}</span>
        </div>
        <p style="font-size:11px;color:${s.text};opacity:0.85;line-height:1.5;margin:0;">${esc(flag.detail)}</p>
      </div>
    </div>
  `;
}

// ─── Tab: Deep Dive ─────────────────────────────────────────

function renderDeepDiveTab(data) {
  return `
    <!-- Ratio Dashboard -->
    ${renderRatioDashboard(data.ratios, data.periods)}

    <!-- DuPont -->
    ${data.duPont ? renderDuPont(data.duPont) : ''}

    <!-- Cost Structure -->
    ${data.costStructure ? renderCostStructure(data.costStructure) : ''}
  `;
}

// ─── Tab: Cash & Capital ────────────────────────────────────

function renderCashCapitalTab(data) {
  return `
    ${data.cashFlowAnalysis ? renderCashFlowAnalysis(data.cashFlowAnalysis) : ''}
    ${data.workingCapital ? renderWorkingCapital(data.workingCapital) : ''}
    ${data.debtCapacity ? renderDebtCapacity(data.debtCapacity) : ''}
  `;
}

// ─── Tab: Valuation ─────────────────────────────────────────

function renderValuationTab(data) {
  return `
    ${data.lboScreen ? renderLBOScreen(data.lboScreen) : ''}
    ${data.benchmark && data.benchmark.hasData && data.benchmark.peerCount > 0 ? renderBenchmark(data.benchmark) : '<div class="analysis-card"><p style="color:#94A3B8;font-size:12px;text-align:center;padding:20px 0;">Portfolio benchmarking requires 2+ deals with financials extracted.</p></div>'}
  `;
}

// ─── Tab: Diligence ─────────────────────────────────────────

function renderDiligenceTab(data) {
  return `
    ${data.redFlags && data.redFlags.length > 0 ? renderRedFlags(data.redFlags) : '<div class="analysis-card"><div class="analysis-card-header"><span class="material-symbols-outlined" style="color:#059669;">check_circle</span><span class="analysis-card-title">No Red Flags Detected</span></div><p style="color:#6B7280;font-size:12px;">All automated deep detection checks passed.</p></div>'}
    ${data.crossDoc && data.crossDoc.hasData ? renderCrossDoc(data.crossDoc) : ''}
  `;
}

// ─── Tab: AI Insights ──────────────────────────────────────

function renderAIInsightsTab(data) {
  if (!data.insights) {
    return `
      <div class="analysis-card" style="text-align:center;padding:32px;">
        <span class="material-symbols-outlined" style="font-size:40px;color:#94A3B8;margin-bottom:12px;">auto_awesome</span>
        <h3 style="font-size:14px;font-weight:600;color:#64748B;margin-bottom:6px;">AI Insights Loading...</h3>
        <p style="font-size:12px;color:#94A3B8;line-height:1.6;">Narrative insights are generated asynchronously.<br>Refresh in a few seconds to see AI-powered analysis.</p>
      </div>
    `;
  }

  const insights = data.insights;
  const sections = [
    { key: 'executiveSummary', title: 'Executive Summary', icon: 'summarize' },
    { key: 'keyStrengths', title: 'Key Strengths', icon: 'thumb_up' },
    { key: 'keyRisks', title: 'Key Risks', icon: 'warning' },
    { key: 'investmentThesis', title: 'Investment Thesis', icon: 'lightbulb' },
    { key: 'dueDiligencePriorities', title: 'Due Diligence Priorities', icon: 'checklist' },
  ];

  return sections.map(s => {
    const content = insights[s.key];
    if (!content) return '';
    const text = Array.isArray(content) ? content.map(c => `<li style="margin-bottom:6px;">${esc(c)}</li>`).join('') : `<p style="margin:0;line-height:1.7;">${esc(content)}</p>`;
    const isList = Array.isArray(content);
    return `
      <div class="analysis-card">
        <div class="analysis-card-header">
          <span class="material-symbols-outlined">${s.icon}</span>
          <span class="analysis-card-title">${s.title}</span>
        </div>
        ${isList ? `<ul style="font-size:12px;color:#334155;padding-left:18px;margin:0;">${text}</ul>` : `<div style="font-size:12px;color:#334155;">${text}</div>`}
      </div>
    `;
  }).join('');
}

// ─── Tab: Memo ──────────────────────────────────────────────

function renderMemoTab(data) {
  const dealId = analysisState.data?._dealId || new URLSearchParams(window.location.search).get('id') || '';
  const hasMemo = data.memo && data.memo.sections && data.memo.sections.length > 0;
  const qoeScore = data.memo?.qoeScore || data.qoe?.score;
  const sectionCount = data.memo?.sections?.length || 0;

  return `
    <div class="analysis-card" style="text-align:center;padding:40px 32px;">
      <div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,${BANKER_BLUE_MUTED},#D6DEE8);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
        <span class="material-symbols-outlined" style="font-size:32px;color:${BANKER_BLUE};">description</span>
      </div>
      <h3 style="font-size:16px;font-weight:700;color:#111827;margin-bottom:6px;">${hasMemo ? 'Investment Memo Ready' : 'Generate Investment Memo'}</h3>
      <p style="font-size:12px;color:#64748B;margin-bottom:4px;line-height:1.6;">
        ${hasMemo
          ? `Auto-generated memo with ${sectionCount} sections based on extracted financials.`
          : 'Extract financial data first to auto-generate an investment memorandum.'}
      </p>
      ${qoeScore != null ? `<span class="analysis-badge" style="background:${BANKER_BLUE_MUTED};color:${BANKER_BLUE};margin-bottom:20px;display:inline-flex;">QoE Score: ${qoeScore}/100</span>` : ''}
      <div style="margin-top:16px;">
        <a href="/memo-builder.html?dealId=${dealId}"
          style="display:inline-flex;align-items:center;gap:8px;padding:12px 28px;font-size:13px;font-weight:700;color:#fff;background:linear-gradient(135deg,${BANKER_BLUE},${BANKER_BLUE_LIGHT});border-radius:10px;text-decoration:none;box-shadow:0 2px 8px rgba(0,51,102,0.25);transition:all 0.2s ease;font-family:'Inter',system-ui,sans-serif;"
          onmouseover="this.style.boxShadow='0 4px 16px rgba(0,51,102,0.35)';this.style.transform='translateY(-1px)';"
          onmouseout="this.style.boxShadow='0 2px 8px rgba(0,51,102,0.25)';this.style.transform='none';">
          <span class="material-symbols-outlined" style="font-size:18px;">edit_document</span>
          Open Memo Builder
        </a>
      </div>
    </div>
  `;
}

// ─── Module renderers loaded from js/analysis-modules.js ────
// renderEBITDABridge, renderRevenueQuality, renderRatioDashboard,
// renderRatioRow, switchRatioTab, renderDuPont, renderRedFlags,
// renderCashFlowAnalysis, renderWorkingCapital, renderCostStructure,
// renderDebtCapacity, renderLBOScreen, renderCrossDoc, renderBenchmark

// ─── Chart renderers loaded from js/analysis-charts.js ──────
// renderRatioCharts, renderSingleRatioChart

// renderMemo removed — Memo tab now links to /memo-builder.html

// ─── Utility ────────────────────────────────────────────────

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// escapeHtml is already defined globally in deal.js — use esc() internally
