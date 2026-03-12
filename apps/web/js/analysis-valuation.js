/**
 * analysis-valuation.js — LBO Screen, Cross-Doc, Benchmarking renderers
 * Extracted from analysis-modules.js. Loaded before analysis-modules.js.
 * Uses: esc, BANKER_BLUE, BANKER_BLUE_MUTED, SEVERITY_STYLES
 */

/* global esc, BANKER_BLUE, BANKER_BLUE_MUTED, SEVERITY_STYLES */

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
