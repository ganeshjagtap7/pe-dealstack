/**
 * Financial Analysis — Styles & Constants
 * Extracted from analysis.js. Globals: BANKER_BLUE, BANKER_BLUE_LIGHT,
 * BANKER_BLUE_MUTED, CHART_PALETTE, SEVERITY_STYLES, TABS, injectAnalysisStyles
 */

const BANKER_BLUE = '#003366';
const BANKER_BLUE_LIGHT = '#004488';
const BANKER_BLUE_MUTED = '#E8EEF4';
const CHART_PALETTE = ['#003366', '#059669', '#d97706', '#7C3AED', '#dc2626', '#0891B2', '#E11D48', '#4338CA'];

const SEVERITY_STYLES = {
  critical: { bg: '#FEF2F2', border: '#FECACA', text: '#991B1B', icon: '#dc2626', badge: '#dc2626', badgeBg: '#FEE2E2' },
  warning:  { bg: '#FFFBEB', border: '#FDE68A', text: '#92400E', icon: '#d97706', badge: '#d97706', badgeBg: '#FEF3C7' },
  positive: { bg: '#ECFDF5', border: '#A7F3D0', text: '#065F46', icon: '#059669', badge: '#059669', badgeBg: '#D1FAE5' },
  info:     { bg: '#F3F4F6', border: '#D1D5DB', text: '#374151', icon: '#6B7280', badge: '#6B7280', badgeBg: '#E5E7EB' },
};

const TABS = [
  { id: 'overview',  label: 'Overview',       icon: 'dashboard' },
  { id: 'deepdive',  label: 'Deep Dive',      icon: 'analytics' },
  { id: 'cashcap',   label: 'Cash & Capital',  icon: 'payments' },
  { id: 'valuation', label: 'Valuation',      icon: 'rocket_launch' },
  { id: 'diligence', label: 'Diligence',      icon: 'verified' },
  { id: 'aiinsights', label: 'AI Insights',   icon: 'auto_awesome' },
  { id: 'memo',      label: 'Memo',           icon: 'description' },
];

function injectAnalysisStyles() {
  if (document.getElementById('analysis-premium-styles')) return;
  const style = document.createElement('style');
  style.id = 'analysis-premium-styles';
  style.textContent = `
    @keyframes analysisFadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes analysisSlideUp {
      from { opacity: 0; transform: translateY(16px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .analysis-fade-in {
      animation: analysisFadeIn 0.4s ease-out both;
    }
    .analysis-slide-up {
      animation: analysisSlideUp 0.5s ease-out both;
    }
    .analysis-tab {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 10px 18px; font-size: 12px; font-weight: 600;
      border: none; background: transparent; cursor: pointer;
      color: #6B7280; border-bottom: 2px solid transparent;
      transition: all 0.25s ease; white-space: nowrap;
      font-family: 'Inter', system-ui, sans-serif;
    }
    .analysis-tab:hover {
      color: ${BANKER_BLUE}; background: ${BANKER_BLUE}08;
    }
    .analysis-tab.active {
      color: ${BANKER_BLUE}; border-bottom-color: ${BANKER_BLUE};
      background: ${BANKER_BLUE}08;
    }
    .analysis-tab .material-symbols-outlined { font-size: 16px; }
    .analysis-card {
      background: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 12px;
      padding: 20px 24px; margin-bottom: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02);
      transition: box-shadow 0.2s ease, transform 0.2s ease;
    }
    .analysis-card:hover {
      box-shadow: 0 4px 12px rgba(0,51,102,0.08), 0 2px 4px rgba(0,0,0,0.04);
    }
    .analysis-card-header {
      display: flex; align-items: center; gap: 10px; margin-bottom: 16px;
    }
    .analysis-card-header .material-symbols-outlined {
      font-size: 20px; color: ${BANKER_BLUE};
    }
    .analysis-card-title {
      font-size: 13px; font-weight: 700; color: #111827;
      text-transform: uppercase; letter-spacing: 0.06em;
    }
    .analysis-badge {
      font-size: 10px; font-weight: 600; padding: 3px 10px;
      border-radius: 20px; display: inline-flex; align-items: center; gap: 4px;
    }
    .analysis-metric-card {
      background: linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%);
      border: 1px solid #E2E8F0; border-radius: 12px;
      padding: 16px 20px; text-align: left;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .analysis-metric-card:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0,51,102,0.06);
    }
    .analysis-metric-label {
      font-size: 10px; color: #64748B; text-transform: uppercase;
      font-weight: 600; letter-spacing: 0.04em; margin-bottom: 4px;
    }
    .analysis-metric-value {
      font-size: 24px; font-weight: 800; color: ${BANKER_BLUE}; line-height: 1.2;
    }
    .analysis-metric-sub {
      font-size: 10px; color: #94A3B8; margin-top: 2px;
    }
    .analysis-table {
      width: 100%; border-collapse: separate; border-spacing: 0;
      font-size: 12px; overflow: hidden; border-radius: 8px;
      border: 1px solid #E5E7EB;
    }
    .analysis-table thead th {
      text-align: left; padding: 10px 14px; color: #64748B;
      font-weight: 600; font-size: 10px; text-transform: uppercase;
      letter-spacing: 0.04em; background: #F8FAFC;
      border-bottom: 2px solid #E2E8F0;
    }
    .analysis-table thead th:not(:first-child) { text-align: right; }
    .analysis-table tbody td {
      padding: 10px 14px; border-bottom: 1px solid #F1F5F9; color: #1E293B;
    }
    .analysis-table tbody td:not(:first-child) { text-align: right; }
    .analysis-table tbody tr:last-child td { border-bottom: none; }
    .analysis-table tbody tr:hover { background: #F8FAFC; }
    .analysis-table .summary-row td {
      background: linear-gradient(135deg, #F0F4F8 0%, #E8EEF4 100%);
      font-weight: 700; color: ${BANKER_BLUE}; border-bottom: none;
    }
    .analysis-ratio-tab {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 7px 14px; font-size: 11px; font-weight: 600;
      border-radius: 8px; border: 1px solid #E5E7EB;
      background: #fff; color: #6B7280; cursor: pointer;
      transition: all 0.2s ease; font-family: 'Inter', system-ui, sans-serif;
    }
    .analysis-ratio-tab:hover { border-color: ${BANKER_BLUE}40; color: ${BANKER_BLUE}; }
    .analysis-ratio-tab.active {
      background: ${BANKER_BLUE}; color: #fff; border-color: ${BANKER_BLUE};
    }
    .analysis-ratio-tab .material-symbols-outlined { font-size: 14px; }
    .analysis-panel { display: none; }
    .analysis-panel.active { display: block; }
    .analysis-flag {
      display: flex; align-items: flex-start; gap: 12px;
      padding: 12px 16px; border-radius: 10px; border: 1px solid;
      transition: transform 0.15s ease;
    }
    .analysis-flag:hover { transform: translateX(2px); }
    .analysis-score-ring {
      flex-shrink: 0; width: 88px; height: 88px; border-radius: 50%;
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; border: 3px solid;
      position: relative; overflow: hidden;
    }
    .analysis-score-ring::before {
      content: ''; position: absolute; inset: 0; opacity: 0.08;
      border-radius: 50%;
    }
    .analysis-tab-content {
      animation: analysisFadeIn 0.35s ease-out both;
    }
    .analysis-lbo-cell {
      text-align: center; padding: 8px 10px; transition: background 0.15s ease;
    }
    .analysis-lbo-cell:hover { background: #F8FAFC; }
    .analysis-memo-section {
      margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid #F1F5F9;
    }
    .analysis-memo-section:last-child { border-bottom: none; margin-bottom: 0; }
  `;
  document.head.appendChild(style);
}
