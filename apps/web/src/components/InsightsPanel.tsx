import React from 'react';
import { FolderInsights } from '../types/vdr.types';

interface InsightsPanelProps {
  insights?: FolderInsights | null;
  folderName: string;
  onGenerateReport: () => void;
  onViewFile?: (fileId: string) => void;
  onRequestDocument?: (docId: string) => void;
  onGenerateInsights?: () => void;
  isGenerating?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const InsightsPanel: React.FC<InsightsPanelProps> = ({
  insights,
  folderName,
  onGenerateReport,
  onViewFile,
  onRequestDocument,
  onGenerateInsights,
  isGenerating = false,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  // Collapsed state - show just a thin bar
  if (isCollapsed) {
    return (
      <aside className="w-12 min-w-12 bg-white border-l border-slate-200 shadow-xl z-20 flex flex-col items-center py-4">
        <button
          onClick={onToggleCollapse}
          className="p-2 rounded-lg hover:bg-slate-50 transition-colors"
          title="Expand AI Quick Insights"
        >
          <span className="material-symbols-outlined text-primary">smart_toy</span>
        </button>
        <button
          onClick={onToggleCollapse}
          className="p-2 rounded-lg hover:bg-slate-50 transition-colors mt-2"
          title="Expand panel"
        >
          <span className="material-symbols-outlined text-slate-400">chevron_left</span>
        </button>
      </aside>
    );
  }

  // No folder selected
  if (!insights && !folderName) {
    return (
      <aside className="w-[320px] min-w-[320px] bg-white border-l border-slate-200 shadow-xl z-20 flex flex-col">
        <div className="p-5 border-b border-slate-200 bg-gradient-to-r from-white to-blue-50/30">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">smart_toy</span>
              <h2 className="text-sm font-bold text-slate-900 tracking-wide uppercase">AI Quick Insights</h2>
            </div>
            <button
              onClick={onToggleCollapse}
              className="p-1 rounded hover:bg-slate-100 transition-colors"
              title="Collapse panel"
            >
              <span className="material-symbols-outlined text-slate-400 text-[20px]">chevron_right</span>
            </button>
          </div>
          <p className="text-xs text-slate-500">Select a folder to view insights</p>
        </div>
      </aside>
    );
  }

  // Check if insights are empty/placeholder (no real AI data yet)
  const hasRealInsights = insights && (
    insights.summary !== 'No insights available for this folder yet.' ||
    insights.redFlags.length > 0 ||
    insights.missingDocuments.length > 0 ||
    insights.completionPercent > 0
  );

  // Generating state
  if (isGenerating) {
    return (
      <aside className="w-[320px] min-w-[320px] bg-white border-l border-slate-200 shadow-xl z-20 flex flex-col">
        <div className="p-5 border-b border-slate-200 bg-gradient-to-r from-white to-blue-50/30">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">smart_toy</span>
              <h2 className="text-sm font-bold text-slate-900 tracking-wide uppercase">AI Quick Insights</h2>
            </div>
            <button
              onClick={onToggleCollapse}
              className="p-1 rounded hover:bg-slate-100 transition-colors"
              title="Collapse panel"
            >
              <span className="material-symbols-outlined text-slate-400 text-[20px]">chevron_right</span>
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Analysis for <span className="font-medium text-slate-900">{folderName}</span>
          </p>
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-slate-200 mx-auto mb-4" style={{ borderTopColor: '#003366' }}></div>
            <p className="text-sm font-medium text-slate-700 mb-1">Analyzing folder...</p>
            <p className="text-xs text-slate-400">GPT-4o is scanning documents and generating insights</p>
          </div>
        </div>
      </aside>
    );
  }

  // No insights yet — show CTA to generate
  if (!hasRealInsights) {
    return (
      <aside className="w-[320px] min-w-[320px] bg-white border-l border-slate-200 shadow-xl z-20 flex flex-col">
        <div className="p-5 border-b border-slate-200 bg-gradient-to-r from-white to-blue-50/30">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">smart_toy</span>
              <h2 className="text-sm font-bold text-slate-900 tracking-wide uppercase">AI Quick Insights</h2>
            </div>
            <button
              onClick={onToggleCollapse}
              className="p-1 rounded hover:bg-slate-100 transition-colors"
              title="Collapse panel"
            >
              <span className="material-symbols-outlined text-slate-400 text-[20px]">chevron_right</span>
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Analysis for <span className="font-medium text-slate-900">{folderName}</span>
          </p>
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl mx-auto mb-4" style={{ backgroundColor: '#E6EEF5' }}>
              <span className="material-symbols-outlined text-3xl" style={{ color: '#003366' }}>auto_awesome</span>
            </div>
            <h3 className="text-sm font-semibold text-slate-900 mb-1">No insights yet</h3>
            <p className="text-xs text-slate-500 mb-5 leading-relaxed">
              AI will analyze documents in this folder, identify missing items, and flag potential risks.
            </p>
            <button
              onClick={onGenerateInsights}
              className="flex items-center justify-center gap-2 w-full rounded-lg py-2.5 text-sm font-bold text-white transition-colors shadow-lg"
              style={{ backgroundColor: '#003366' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#004488')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#003366')}
            >
              <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
              Generate AI Insights
            </button>
          </div>
        </div>
      </aside>
    );
  }

  // Parse and highlight completion percentage in summary
  const formatSummaryWithHighlight = (summary: string) => {
    const percentPattern = /(\d+)%(\s*complete)?/gi;
    const parts = summary.split(percentPattern);

    if (parts.length === 1) {
      return <span>{summary}</span>;
    }

    return summary.split(percentPattern).map((part, index) => {
      if (/^\d+$/.test(part)) {
        return (
          <span key={index} className="font-bold text-green-600">
            {part}%
          </span>
        );
      } else if (part?.toLowerCase() === ' complete') {
        return <span key={index} className="font-bold text-green-600">{part}</span>;
      }
      return <span key={index}>{part}</span>;
    });
  };

  return (
    <aside className="w-[320px] min-w-[320px] bg-white border-l border-slate-200 shadow-xl z-20 flex flex-col">
      {/* Header */}
      <div className="p-5 border-b border-slate-200 bg-gradient-to-r from-white to-blue-50/30">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">smart_toy</span>
            <h2 className="text-sm font-bold text-slate-900 tracking-wide uppercase">AI Quick Insights</h2>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onGenerateInsights}
              className="p-1 rounded hover:bg-slate-100 transition-colors"
              title="Refresh AI insights"
            >
              <span className="material-symbols-outlined text-slate-400 text-[20px]">refresh</span>
            </button>
            <button
              onClick={onToggleCollapse}
              className="p-1 rounded hover:bg-slate-100 transition-colors"
              title="Collapse panel"
            >
              <span className="material-symbols-outlined text-slate-400 text-[20px]">chevron_right</span>
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Analysis for <span className="font-medium text-slate-900">{folderName}</span>
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {/* Completion Bar */}
        {insights!.completionPercent > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Completeness</h3>
              <span className={`text-xs font-bold ${
                insights!.completionPercent >= 80 ? 'text-green-600' :
                insights!.completionPercent >= 50 ? 'text-amber-600' : 'text-red-600'
              }`}>
                {insights!.completionPercent}%
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-100">
              <div
                className="h-2 rounded-full transition-all duration-500"
                style={{
                  width: `${insights!.completionPercent}%`,
                  backgroundColor: insights!.completionPercent >= 80 ? '#16a34a' :
                    insights!.completionPercent >= 50 ? '#d97706' : '#dc2626',
                }}
              />
            </div>
          </div>
        )}

        {/* Summary Block */}
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Summary</h3>
          <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 leading-relaxed border border-slate-100">
            {formatSummaryWithHighlight(insights!.summary)}
          </div>
        </div>

        {/* Red Flags Block */}
        {insights!.redFlags.length > 0 && (
          <div className="flex flex-col gap-3">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
              Red Flags
              <span className="bg-red-100 text-red-700 text-[10px] px-2 py-0.5 rounded-full">
                {insights!.redFlags.length} Found
              </span>
            </h3>
            {insights!.redFlags.map((flag) => (
              <div
                key={flag.id}
                className={`rounded-lg border p-3 ${
                  flag.color === 'red'
                    ? 'border-red-100 bg-red-50/50'
                    : 'border-orange-100 bg-orange-50/50'
                }`}
              >
                <div className="flex items-start gap-2">
                  <span
                    className={`material-symbols-outlined text-[20px] mt-0.5 ${
                      flag.color === 'red' ? 'text-red-500' : 'text-orange-500'
                    }`}
                  >
                    {flag.severity === 'high' ? 'error' : 'warning'}
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-slate-900">{flag.title}</p>
                    <p className="text-xs text-slate-600 mt-1">{flag.description}</p>
                    {flag.fileId && (
                      <button
                        className={`mt-2 text-[10px] font-bold hover:underline ${
                          flag.color === 'red' ? 'text-red-600' : 'text-orange-600'
                        }`}
                        onClick={() => onViewFile?.(flag.fileId!)}
                      >
                        View File
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Missing Docs */}
        {insights!.missingDocuments.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
              Missing Documents
              <span className="bg-amber-100 text-amber-700 text-[10px] px-2 py-0.5 rounded-full">
                {insights!.missingDocuments.length}
              </span>
            </h3>
            <ul className="space-y-2">
              {insights!.missingDocuments.map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-center justify-between gap-2 text-xs text-slate-600 p-2 rounded hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-amber-400"></span>
                    <span>{doc.name}</span>
                  </div>
                  <button
                    className="text-primary font-medium hover:underline shrink-0"
                    onClick={() => onRequestDocument?.(doc.id)}
                  >
                    Request
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Panel Footer */}
      <div className="p-4 border-t border-slate-200">
        <button
          onClick={onGenerateReport}
          className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold text-white transition-colors shadow-lg"
          style={{ backgroundColor: '#003366' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#004488')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#003366')}
        >
          <span className="material-symbols-outlined text-[18px]">summarize</span>
          Generate Full Report
        </button>
      </div>
    </aside>
  );
};
