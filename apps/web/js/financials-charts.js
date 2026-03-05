/**
 * financials-charts.js — Chart.js rendering for Financial Statements
 * Extracted from financials.js. Loaded before financials.js.
 * Uses: finState, Chart (global), filterConsistentPeriods, createGradient
 */

/* global finState, Chart, CHART_TOOLTIP, CHART_LEGEND */

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
