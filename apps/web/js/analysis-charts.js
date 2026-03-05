/**
 * analysis-charts.js — Chart.js renderers for Financial Analysis module
 * Extracted from analysis.js. Loaded before analysis.js.
 * Uses: analysisState, CHART_PALETTE, Chart (global)
 */

/* global analysisState, CHART_PALETTE, Chart */

// ─── Premium Charts ─────────────────────────────────────────

function renderRatioCharts(ratios, _periods) {
  renderSingleRatioChart(0, ratios[0], _periods);
}

function renderSingleRatioChart(idx, group, periods) {
  if (!group?.ratios || !periods?.length) return;

  const canvasId = `ratio-chart-${idx}`;
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  // Destroy existing
  const existing = analysisState.chartInstances.find(c => c.canvas?.id === canvasId);
  if (existing) {
    existing.destroy();
    analysisState.chartInstances = analysisState.chartInstances.filter(c => c !== existing);
  }

  const validRatios = group.ratios.filter(r => r.periods.some(p => p.value != null));
  if (!validRatios.length) return;

  const ctx = canvas.getContext('2d');

  const datasets = validRatios.map((ratio, i) => {
    const color = CHART_PALETTE[i % CHART_PALETTE.length];
    // Create gradient fill
    const gradient = ctx.createLinearGradient(0, 0, 0, 220);
    gradient.addColorStop(0, color + '20');
    gradient.addColorStop(1, color + '02');

    return {
      label: ratio.name,
      data: ratio.periods.map(p => p.value),
      borderColor: color,
      backgroundColor: gradient,
      borderWidth: 2.5,
      tension: 0.4,
      fill: true,
      pointRadius: 4,
      pointHoverRadius: 7,
      pointBackgroundColor: '#fff',
      pointBorderWidth: 2.5,
      pointBorderColor: color,
      pointHoverBackgroundColor: color,
      pointHoverBorderColor: '#fff',
      pointHoverBorderWidth: 2,
    };
  });

  const chart = new Chart(canvas, {
    type: 'line',
    data: { labels: periods, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            usePointStyle: true,
            pointStyle: 'circle',
            font: { size: 11, family: "'Inter', system-ui, sans-serif", weight: '500' },
            padding: 16,
            color: '#475569',
          },
        },
        tooltip: {
          backgroundColor: '#0F172A',
          titleColor: '#F8FAFC',
          titleFont: { size: 12, weight: '600', family: "'Inter', system-ui, sans-serif" },
          bodyFont: { size: 11, family: "'Inter', system-ui, sans-serif" },
          bodyColor: '#CBD5E1',
          padding: 12,
          cornerRadius: 10,
          displayColors: true,
          boxWidth: 8,
          boxHeight: 8,
          boxPadding: 4,
          callbacks: {
            label: (ctx2) => {
              const ratio = validRatios[ctx2.datasetIndex];
              const val = ctx2.parsed.y;
              if (val == null) return '';
              const u = ratio.unit === '%' ? '%' : ratio.unit === 'x' ? 'x' : ratio.unit === 'days' ? ' days' : '';
              return ` ${ratio.name}: ${val}${u}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 11, family: "'Inter', system-ui, sans-serif" }, color: '#64748B' },
          border: { color: '#E2E8F0' },
        },
        y: {
          grid: { color: '#F1F5F9', lineWidth: 1 },
          ticks: { font: { size: 11, family: "'Inter', system-ui, sans-serif" }, color: '#64748B', padding: 8 },
          border: { display: false },
        },
      },
    },
  });

  analysisState.chartInstances.push(chart);
}
