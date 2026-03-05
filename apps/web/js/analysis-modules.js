/**
 * analysis-modules.js — Individual module renderers for Financial Analysis
 * Extracted from analysis.js. Loaded before analysis.js.
 * Uses: esc, BANKER_BLUE, BANKER_BLUE_MUTED, SEVERITY_STYLES, analysisState
 */

/* global esc, BANKER_BLUE, BANKER_BLUE_MUTED, SEVERITY_STYLES, analysisState */

// ─── Component: Ratio Dashboard ─────────────────────────

function renderRatioDashboard(ratioGroups, periods) {
  if (!ratioGroups?.length) return '';

  const tabs = ratioGroups.map((g, i) => `
    <button onclick="switchRatioTab(${i})" id="ratio-tab-${i}"
      style="padding:6px 14px;font-size:12px;font-weight:600;border-radius:6px;border:none;cursor:pointer;
        font-family:'Inter',system-ui,sans-serif;transition:all 0.2s;
        ${i === 0 ? `background:${BANKER_BLUE};color:#fff;` : 'background:#F1F5F9;color:#64748B;'}"
    >${g.icon || ''} ${g.category}</button>
  `).join('');

  const panels = ratioGroups.map((g, i) => `
    <div id="ratio-panel-${i}" style="display:${i === 0 ? 'block' : 'none'};">
      <table style="width:100%;border-collapse:collapse;font-size:12px;font-family:'Inter',system-ui,sans-serif;">
        <thead>
          <tr style="border-bottom:2px solid #E2E8F0;">
            <th style="text-align:left;padding:8px 10px;color:#64748B;font-weight:600;">Metric</th>
            ${(periods || []).map(p => `<th style="text-align:right;padding:8px 10px;color:#64748B;font-weight:600;">${p}</th>`).join('')}
            <th style="text-align:center;padding:8px 10px;color:#64748B;font-weight:600;">Trend</th>
          </tr>
        </thead>
        <tbody>
          ${g.ratios.map(r => renderRatioRow(r, periods)).join('')}
        </tbody>
      </table>
    </div>
  `).join('');

  return `
    <div class="analysis-card">
      <div class="analysis-card-header">
        <span class="material-symbols-outlined">monitoring</span>
        <span class="analysis-card-title">Financial Ratios</span>
        <span class="analysis-badge" style="background:${BANKER_BLUE_MUTED};color:${BANKER_BLUE};">${ratioGroups.reduce((s, g) => s + g.ratios.length, 0)} ratios</span>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap;">${tabs}</div>
      ${panels}
    </div>
  `;
}

function renderRatioRow(ratio, periods) {
  const trendIcon = ratio.trend === 'improving' ? '↗' : ratio.trend === 'declining' ? '↘' : ratio.trend === 'stable' ? '→' : '—';
  const trendColor = ratio.trend === 'improving' ? '#059669' : ratio.trend === 'declining' ? '#dc2626' : '#64748B';
  const unit = ratio.unit === '%' ? '%' : ratio.unit === 'x' ? 'x' : ratio.unit === '$M' ? 'M' : ratio.unit === 'days' ? 'd' : '';

  return `
    <tr style="border-bottom:1px solid #F1F5F9;" title="${ratio.description || ''}">
      <td style="padding:8px 10px;font-weight:500;color:#1E293B;">${ratio.name}</td>
      ${(periods || []).map(p => {
        const pd = ratio.periods?.find(v => v.period === p);
        const val = pd?.value;
        let color = '#1E293B';
        if (ratio.benchmark && val != null) {
          color = val >= ratio.benchmark.high ? '#059669' : val >= ratio.benchmark.mid ? '#d97706' : val < ratio.benchmark.low ? '#dc2626' : '#1E293B';
        }
        return `<td style="text-align:right;padding:8px 10px;color:${color};font-weight:500;">${val != null ? val.toFixed(1) + unit : '—'}</td>`;
      }).join('')}
      <td style="text-align:center;padding:8px 10px;color:${trendColor};font-weight:600;">${trendIcon}</td>
    </tr>
  `;
}

function switchRatioTab(idx) {
  document.querySelectorAll('[id^="ratio-panel-"]').forEach(p => p.style.display = 'none');
  document.querySelectorAll('[id^="ratio-tab-"]').forEach(t => {
    t.style.background = '#F1F5F9';
    t.style.color = '#64748B';
  });
  const panel = document.getElementById('ratio-panel-' + idx);
  const tab = document.getElementById('ratio-tab-' + idx);
  if (panel) panel.style.display = 'block';
  if (tab) { tab.style.background = BANKER_BLUE; tab.style.color = '#fff'; }
}

// ─── Component: DuPont Decomposition ────────────────────

function renderDuPont(duPont) {
  if (!duPont?.periods?.length) return '';

  const fmt = v => v != null ? v.toFixed(2) : '—';

  return `
    <div class="analysis-card">
      <div class="analysis-card-header">
        <span class="material-symbols-outlined">schema</span>
        <span class="analysis-card-title">DuPont Decomposition</span>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;font-family:'Inter',system-ui,sans-serif;">
        <thead>
          <tr style="border-bottom:2px solid #E2E8F0;">
            <th style="text-align:left;padding:8px 10px;color:#64748B;font-weight:600;">Component</th>
            ${duPont.periods.map(p => `<th style="text-align:right;padding:8px 10px;color:#64748B;font-weight:600;">${p.period}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          <tr style="border-bottom:1px solid #F1F5F9;">
            <td style="padding:8px 10px;font-weight:500;color:#1E293B;">Net Profit Margin</td>
            ${duPont.periods.map(p => `<td style="text-align:right;padding:8px 10px;color:#1E293B;">${fmt(p.netProfitMargin)}%</td>`).join('')}
          </tr>
          <tr style="border-bottom:1px solid #F1F5F9;">
            <td style="padding:8px 10px;font-weight:500;color:#1E293B;">Asset Turnover</td>
            ${duPont.periods.map(p => `<td style="text-align:right;padding:8px 10px;color:#1E293B;">${fmt(p.assetTurnover)}x</td>`).join('')}
          </tr>
          <tr style="border-bottom:1px solid #F1F5F9;">
            <td style="padding:8px 10px;font-weight:500;color:#1E293B;">Equity Multiplier</td>
            ${duPont.periods.map(p => `<td style="text-align:right;padding:8px 10px;color:#1E293B;">${fmt(p.equityMultiplier)}x</td>`).join('')}
          </tr>
          <tr style="border-bottom:2px solid #E2E8F0;background:#F8FAFC;">
            <td style="padding:8px 10px;font-weight:700;color:${BANKER_BLUE};">ROE</td>
            ${duPont.periods.map(p => {
              const c = p.roe != null && p.roe >= 15 ? '#059669' : p.roe != null && p.roe >= 8 ? '#d97706' : '#dc2626';
              return `<td style="text-align:right;padding:8px 10px;font-weight:700;color:${c};">${fmt(p.roe)}%</td>`;
            }).join('')}
          </tr>
        </tbody>
      </table>
      <div style="margin-top:12px;padding:10px 14px;background:#F0F7FF;border-radius:8px;font-size:11px;color:#475569;line-height:1.5;">
        ROE = Net Profit Margin × Asset Turnover × Equity Multiplier
      </div>
    </div>
  `;
}

// ─── Component: Red Flags ───────────────────────────────────

function renderRedFlags(redFlags) {
  if (!redFlags?.length) return '';

  return `
    <div class="analysis-card">
      <div class="analysis-card-header">
        <span class="material-symbols-outlined" style="color:#dc2626;">flag</span>
        <span class="analysis-card-title">Red Flag Analysis</span>
        <span class="analysis-badge" style="background:#FEE2E2;color:#dc2626;">${redFlags.length} Flag${redFlags.length !== 1 ? 's' : ''}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${redFlags.map(flag => {
          const s = SEVERITY_STYLES[flag.severity] || SEVERITY_STYLES.info;
          return `
            <div class="analysis-flag" style="background:${s.bg};border-color:${s.border};">
              <span class="material-symbols-outlined" style="font-size:18px;color:${s.icon};flex-shrink:0;margin-top:1px;">${flag.icon}</span>
              <div style="flex:1;min-width:0;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;">
                  <span style="font-size:12px;font-weight:700;color:${s.text};">${esc(flag.title)}</span>
                  <span style="font-size:10px;color:${s.text};opacity:0.5;margin-left:auto;">${flag.category}</span>
                </div>
                <p style="font-size:11px;color:${s.text};opacity:0.85;line-height:1.5;margin:0 0 4px;">${esc(flag.detail)}</p>
                ${flag.evidence ? `<p style="font-size:10px;color:${s.text};opacity:0.5;font-style:italic;margin:0;">Evidence: ${esc(flag.evidence)}</p>` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// ─── Component: EBITDA Bridge ───────────────────────────────

function renderEBITDABridge(bridge) {
  if (!bridge?.periods?.length) return '';
  const vp = bridge.periods.filter(p => p.reportedEbitda != null);
  if (!vp.length) return '';

  return `
    <div class="analysis-card analysis-fade-in" style="animation-delay:0.2s;">
      <div class="analysis-card-header">
        <span class="material-symbols-outlined">bar_chart</span>
        <span class="analysis-card-title">EBITDA Bridge</span>
        <span style="font-size:10px;color:#94A3B8;font-weight:500;">Reported → Adjusted</span>
      </div>
      <div style="overflow-x:auto;">
        <table class="analysis-table">
          <thead>
            <tr>
              <th>Item</th>
              ${vp.map(p => `<th>${p.period}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="font-weight:600;">Reported EBITDA</td>
              ${vp.map(p => `<td style="font-weight:600;">$${p.reportedEbitda}M</td>`).join('')}
            </tr>
            ${(() => {
              const labels = [...new Set(vp.flatMap(p => p.addbacks.map(a => a.label)))];
              return labels.map(label => `
                <tr>
                  <td style="color:#059669;">+ ${esc(label)}</td>
                  ${vp.map(p => {
                    const ab = p.addbacks.find(a => a.label === label);
                    return `<td style="color:#059669;">${ab?.amount != null ? '+$' + ab.amount + 'M' : '—'}</td>`;
                  }).join('')}
                </tr>
              `).join('');
            })()}
            <tr class="summary-row">
              <td>Adjusted EBITDA</td>
              ${vp.map(p => `<td>$${p.adjustedEbitda}M${p.adjustmentPct ? ' <span style="font-size:9px;color:#059669;">(+' + p.adjustmentPct + '%)</span>' : ''}</td>`).join('')}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ─── Component: Revenue Quality ─────────────────────────────

function renderRevenueQuality(rq) {
  if (!rq) return '';

  const scoreColor = rq.consistencyScore >= 75 ? '#059669' : rq.consistencyScore >= 50 ? '#d97706' : '#dc2626';
  const scoreLabel = rq.consistencyScore >= 75 ? 'Consistent' : rq.consistencyScore >= 50 ? 'Moderate' : 'Volatile';

  return `
    <div class="analysis-card analysis-fade-in" style="animation-delay:0.3s;">
      <div class="analysis-card-header">
        <span class="material-symbols-outlined">query_stats</span>
        <span class="analysis-card-title">Revenue Quality</span>
      </div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:14px;">
        <div class="analysis-metric-card" style="flex:1;min-width:140px;">
          <div class="analysis-metric-label">Revenue CAGR</div>
          <div class="analysis-metric-value" style="color:${rq.revenueCAGR >= 0 ? '#059669' : '#dc2626'};">${rq.revenueCAGR != null ? rq.revenueCAGR + '%' : '—'}</div>
        </div>
        <div class="analysis-metric-card" style="flex:1;min-width:140px;">
          <div class="analysis-metric-label">Consistency Score</div>
          <div class="analysis-metric-value" style="color:${scoreColor};">${rq.consistencyScore}<span style="font-size:12px;font-weight:600;"> ${scoreLabel}</span></div>
        </div>
      </div>
      ${rq.organicGrowthRates.length > 0 ? `
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${rq.organicGrowthRates.map(g => {
            const isPos = g.rate != null && g.rate > 0;
            const c = g.rate == null ? '#94A3B8' : isPos ? '#059669' : '#dc2626';
            return `<div style="background:#fff;border:1px solid #E2E8F0;border-radius:8px;padding:8px 14px;text-align:center;">
              <div style="font-size:10px;color:#64748B;font-weight:500;">${g.period}</div>
              <div style="font-size:14px;font-weight:700;color:${c};">${g.rate != null ? (isPos ? '+' : '') + g.rate + '%' : '—'}</div>
            </div>`;
          }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

// ─── Component: Cash Flow Analysis ──────────────────────────

function renderCashFlowAnalysis(cfa) {
  if (!cfa?.periods?.length) return '';
  const vp = cfa.periods.filter(p => p.ebitda != null || p.fcf != null);
  if (!vp.length) return '';

  const convColor = cfa.avgConversion == null ? '#64748B' : cfa.avgConversion >= 70 ? '#059669' : cfa.avgConversion >= 50 ? '#d97706' : '#dc2626';

  return `
    <div class="analysis-card">
      <div class="analysis-card-header">
        <span class="material-symbols-outlined">payments</span>
        <span class="analysis-card-title">Cash Flow Analysis</span>
        ${cfa.avgConversion != null ? `<span class="analysis-badge" style="background:${convColor}15;color:${convColor};">Avg Conversion: ${cfa.avgConversion}%</span>` : ''}
      </div>
      <div style="overflow-x:auto;">
        <table class="analysis-table">
          <thead><tr><th>Item</th>${vp.map(p => `<th>${p.period}</th>`).join('')}</tr></thead>
          <tbody>
            <tr><td style="font-weight:600;">EBITDA</td>${vp.map(p => `<td>${p.ebitda != null ? '$' + p.ebitda + 'M' : '—'}</td>`).join('')}</tr>
            <tr><td style="color:#dc2626;">- CapEx</td>${vp.map(p => `<td style="color:#dc2626;">${p.capex != null ? '($' + p.capex + 'M)' : '—'}</td>`).join('')}</tr>
            <tr><td style="color:#d97706;">- WC Change</td>${vp.map(p => `<td style="color:#d97706;">${p.wcChange != null ? (p.wcChange >= 0 ? '($' + p.wcChange + 'M)' : '+$' + Math.abs(p.wcChange) + 'M') : '—'}</td>`).join('')}</tr>
            <tr class="summary-row"><td>= Free Cash Flow</td>${vp.map(p => `<td>${p.fcf != null ? '$' + p.fcf + 'M' : '—'}</td>`).join('')}</tr>
            <tr>
              <td style="color:#64748B;font-size:10px;">Conversion %</td>
              ${vp.map(p => {
                const c = p.ebitdaToFcfConversion;
                const cc = c == null ? '#94A3B8' : c >= 70 ? '#059669' : c >= 50 ? '#d97706' : '#dc2626';
                return `<td style="font-weight:600;color:${cc};font-size:11px;">${c != null ? c + '%' : '—'}</td>`;
              }).join('')}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ─── Component: Working Capital ─────────────────────────────

function renderWorkingCapital(wc) {
  if (!wc?.periods?.length) return '';

  return `
    <div class="analysis-card">
      <div class="analysis-card-header">
        <span class="material-symbols-outlined">account_balance_wallet</span>
        <span class="analysis-card-title">Working Capital</span>
        ${wc.normalizedNwc != null ? `<span class="analysis-badge" style="background:${BANKER_BLUE_MUTED};color:${BANKER_BLUE};">Normalized NWC: $${wc.normalizedNwc}M</span>` : ''}
      </div>
      <div style="overflow-x:auto;">
        <table class="analysis-table">
          <thead><tr><th>Component</th>${wc.periods.map(p => `<th>${p.period}</th>`).join('')}</tr></thead>
          <tbody>
            <tr><td>Accounts Receivable</td>${wc.periods.map(p => `<td>${p.ar != null ? '$' + p.ar + 'M' : '—'}</td>`).join('')}</tr>
            <tr><td>Inventory</td>${wc.periods.map(p => `<td>${p.inventory != null ? '$' + p.inventory + 'M' : '—'}</td>`).join('')}</tr>
            <tr><td style="color:#dc2626;">Accounts Payable</td>${wc.periods.map(p => `<td style="color:#dc2626;">${p.ap != null ? '($' + p.ap + 'M)' : '—'}</td>`).join('')}</tr>
            <tr class="summary-row"><td>Net Working Capital</td>${wc.periods.map(p => `<td>${p.nwc != null ? '$' + p.nwc + 'M' : '—'}</td>`).join('')}</tr>
            <tr><td style="color:#64748B;font-size:10px;">NWC % Revenue</td>${wc.periods.map(p => `<td style="color:#64748B;font-size:11px;">${p.nwcPctRevenue != null ? p.nwcPctRevenue + '%' : '—'}</td>`).join('')}</tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ─── Component: Cost Structure ──────────────────────────────

function renderCostStructure(cs) {
  if (!cs?.periods?.length) return '';
  const levColors = { high: '#dc2626', moderate: '#d97706', low: '#059669', unknown: '#64748B' };

  return `
    <div class="analysis-card">
      <div class="analysis-card-header">
        <span class="material-symbols-outlined">pie_chart</span>
        <span class="analysis-card-title">Cost Structure</span>
      </div>
      <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:16px;">
        ${cs.breakEvenRevenue != null ? `
          <div class="analysis-metric-card" style="flex:1;min-width:140px;">
            <div class="analysis-metric-label">Break-even Revenue</div>
            <div class="analysis-metric-value">$${cs.breakEvenRevenue}M</div>
          </div>
        ` : ''}
        <div class="analysis-metric-card" style="flex:1;min-width:140px;">
          <div class="analysis-metric-label">Operating Leverage</div>
          <div class="analysis-metric-value" style="color:${levColors[cs.operatingLeverage] || '#64748B'};">${cs.operatingLeverage.charAt(0).toUpperCase() + cs.operatingLeverage.slice(1)}</div>
        </div>
      </div>
      <div style="overflow-x:auto;">
        <table class="analysis-table">
          <thead><tr><th>Cost Category (% Rev)</th>${cs.periods.map(p => `<th>${p.period}</th>`).join('')}</tr></thead>
          <tbody>
            <tr><td>COGS %</td>${cs.periods.map(p => `<td>${p.cogsPct != null ? p.cogsPct + '%' : '—'}</td>`).join('')}</tr>
            <tr><td>SG&A %</td>${cs.periods.map(p => `<td>${p.sgaPct != null ? p.sgaPct + '%' : '—'}</td>`).join('')}</tr>
            <tr><td>R&D %</td>${cs.periods.map(p => `<td>${p.rdPct != null ? p.rdPct + '%' : '—'}</td>`).join('')}</tr>
            <tr class="summary-row"><td>Total OpEx %</td>${cs.periods.map(p => `<td>${p.opexPct != null ? p.opexPct + '%' : '—'}</td>`).join('')}</tr>
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ─── Component: Debt Capacity ───────────────────────────────

function renderDebtCapacity(dc) {
  if (!dc) return '';
  const dscrColor = dc.dscr == null ? '#64748B' : dc.dscr >= 1.5 ? '#059669' : dc.dscr >= 1.25 ? '#d97706' : '#dc2626';

  const metrics = [
    { label: 'Current Leverage', value: dc.currentLeverage != null ? dc.currentLeverage + 'x' : '—', color: BANKER_BLUE },
    { label: 'Max Debt @3x', value: dc.maxDebt3x != null ? '$' + dc.maxDebt3x + 'M' : '—', color: BANKER_BLUE },
    { label: 'Max Debt @4x', value: dc.maxDebt4x != null ? '$' + dc.maxDebt4x + 'M' : '—', color: BANKER_BLUE },
    { label: 'DSCR', value: dc.dscr != null ? dc.dscr + 'x' : '—', color: dscrColor, sub: 'Banks want >1.25x' },
    { label: 'Debt Headroom', value: dc.debtHeadroom != null ? '$' + dc.debtHeadroom + 'M' : '—', color: '#059669', sub: 'vs 4x capacity' },
    { label: 'Interest Coverage', value: dc.interestCoverage != null ? dc.interestCoverage + 'x' : '—', color: BANKER_BLUE },
  ];

  return `
    <div class="analysis-card">
      <div class="analysis-card-header">
        <span class="material-symbols-outlined">account_balance</span>
        <span class="analysis-card-title">Debt Capacity</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;">
        ${metrics.map(m => `
          <div class="analysis-metric-card">
            <div class="analysis-metric-label">${m.label}</div>
            <div class="analysis-metric-value" style="color:${m.color};">${m.value}</div>
            ${m.sub ? `<div class="analysis-metric-sub">${m.sub}</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ─── Component: LBO Quick Screen ────────────────────────────

function renderLBOScreen(lbo) {
  if (!lbo || !lbo.scenarios?.length) return '';

  const passColor = lbo.passesScreen ? '#059669' : '#dc2626';
  const passLabel = lbo.passesScreen ? 'PASSES SCREEN' : 'BELOW THRESHOLD';

  const entryMults = [...new Set(lbo.scenarios.map(s => s.entryMultiple))].sort((a, b) => a - b);
  const exitMults = [...new Set(lbo.scenarios.map(s => s.exitMultiple))].sort((a, b) => a - b);

  return `
    <div class="analysis-card">
      <div class="analysis-card-header">
        <span class="material-symbols-outlined">rocket_launch</span>
        <span class="analysis-card-title">LBO Quick Screen</span>
        <span class="analysis-badge" style="background:${passColor}15;color:${passColor};font-weight:700;">${passLabel}</span>
      </div>
      <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:16px;">
        <div class="analysis-metric-card">
          <div class="analysis-metric-label">Entry EBITDA</div>
          <div class="analysis-metric-value">$${lbo.entryEbitda}M</div>
        </div>
        <div class="analysis-metric-card">
          <div class="analysis-metric-label">Growth Rate</div>
          <div class="analysis-metric-value">${lbo.scenarios[0]?.growthRate || 0}%</div>
        </div>
      </div>
      <div style="overflow-x:auto;">
        <table class="analysis-table">
          <thead>
            <tr>
              <th rowspan="2" style="vertical-align:bottom;">Entry Multiple</th>
              <th colspan="${exitMults.length}" style="text-align:center !important;">Exit Multiple → MOIC / IRR</th>
            </tr>
            <tr>
              ${exitMults.map(em => `<th style="text-align:center !important;">${em}x</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${entryMults.map(entry => `
              <tr>
                <td style="font-weight:700;">${entry}x</td>
                ${exitMults.map(exit => {
                  const s = lbo.scenarios.find(sc => sc.entryMultiple === entry && sc.exitMultiple === exit);
                  if (!s) return '<td class="analysis-lbo-cell">—</td>';
                  const irrC = s.irr == null ? '#94A3B8' : s.irr >= 25 ? '#059669' : s.irr >= 20 ? '#d97706' : '#dc2626';
                  return `<td class="analysis-lbo-cell" style="text-align:center;">
                    <span style="font-weight:700;color:#1E293B;font-size:13px;">${s.moic || '—'}x</span>
                    <br><span style="font-size:10px;color:${irrC};font-weight:600;">${s.irr != null ? s.irr + '% IRR' : ''}</span>
                  </td>`;
                }).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <p style="font-size:10px;color:#94A3B8;margin-top:10px;">Assumes 60% debt / 40% equity, 20% debt paydown over 5 years. <span style="color:#059669;">Green</span> IRR >= 25%, <span style="color:#d97706;">Amber</span> >= 20%.</p>
    </div>
  `;
}

// ─── Component: Cross-Doc Verification ──────────────────────

function renderCrossDoc(crossDoc) {
  if (!crossDoc?.hasData) return '';

  const conflicts = crossDoc.conflicts || [];
  if (!conflicts.length) {
    return `
      <div class="analysis-card">
        <div class="analysis-card-header">
          <span class="material-symbols-outlined" style="color:#059669;">fact_check</span>
          <span class="analysis-card-title">Cross-Document Verification</span>
          <span class="analysis-badge" style="background:#D1FAE5;color:#059669;">No Conflicts</span>
        </div>
        <p style="font-size:12px;color:#64748B;">All financial figures are consistent across ${crossDoc.documents?.length || 0} document(s).</p>
      </div>
    `;
  }

  return `
    <div class="analysis-card">
      <div class="analysis-card-header">
        <span class="material-symbols-outlined" style="color:#d97706;">compare</span>
        <span class="analysis-card-title">Cross-Document Verification</span>
        <span class="analysis-badge" style="background:#FEF3C7;color:#d97706;">${conflicts.length} Discrepanc${conflicts.length !== 1 ? 'ies' : 'y'}</span>
      </div>
      <div style="overflow-x:auto;">
        <table class="analysis-table">
          <thead>
            <tr><th>Period</th><th style="text-align:left !important;">Field</th><th style="text-align:left !important;">Values by Document</th><th>Deviation</th></tr>
          </thead>
          <tbody>
            ${conflicts.slice(0, 10).map(c => `
              <tr>
                <td style="font-weight:600;">${c.period}</td>
                <td style="text-align:left;">${c.field.replace(/_/g, ' ')}</td>
                <td style="text-align:left;">
                  ${c.values.map(v => `<span style="display:inline-block;font-size:10px;background:${v.isActive ? '#D1FAE5' : '#F1F5F9'};padding:2px 8px;border-radius:6px;margin:1px 3px;">${esc(v.documentName)}: $${v.value}M</span>`).join('')}
                </td>
                <td style="font-weight:700;color:${c.discrepancyPct > 10 ? '#dc2626' : '#d97706'};">${c.discrepancyPct}%</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ─── Component: Portfolio Benchmarking ──────────────────────

function renderBenchmark(benchmark) {
  if (!benchmark?.hasData || !benchmark.peerCount) return '';

  return `
    <div class="analysis-card">
      <div class="analysis-card-header">
        <span class="material-symbols-outlined">leaderboard</span>
        <span class="analysis-card-title">Portfolio Benchmarking</span>
        <span class="analysis-badge" style="background:${BANKER_BLUE_MUTED};color:${BANKER_BLUE};">vs ${benchmark.peerCount} peers</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;">
        ${benchmark.benchmarks.map(b => {
          const pc = b.percentile >= 70 ? '#059669' : b.percentile >= 40 ? '#d97706' : '#dc2626';
          const pl = b.percentile >= 70 ? 'Top Quartile' : b.percentile >= 40 ? 'Mid Range' : 'Below Median';
          const u = b.unit === '%' ? '%' : b.unit === '$M' ? 'M' : '';
          return `
            <div class="analysis-metric-card">
              <div class="analysis-metric-label" style="margin-bottom:8px;">${b.metric}</div>
              <div class="analysis-metric-value">${b.dealValue}${u}</div>
              <div style="margin-top:10px;">
                <div style="background:#E2E8F0;height:6px;border-radius:3px;position:relative;overflow:visible;">
                  <div style="background:linear-gradient(90deg,${pc}40,${pc});height:6px;border-radius:3px;width:${b.percentile}%;transition:width 0.8s ease-out;"></div>
                  <div style="position:absolute;top:-3px;left:${b.percentile}%;transform:translateX(-50%);width:12px;height:12px;background:${pc};border-radius:50%;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.2);transition:left 0.8s ease-out;"></div>
                </div>
                <div style="display:flex;justify-content:space-between;margin-top:6px;">
                  <span style="font-size:9px;color:#94A3B8;">${b.peerMin}${u}</span>
                  <span style="font-size:10px;font-weight:600;color:${pc};">${b.percentile}th pctl — ${pl}</span>
                  <span style="font-size:9px;color:#94A3B8;">${b.peerMax}${u}</span>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}
