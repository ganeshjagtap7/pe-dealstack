import React from 'react';
import { FolderInsights } from '../types/vdr.types';

interface InsightsPanelProps {
  insights?: FolderInsights | null;
  folderName: string;
  onGenerateReport: () => void;
  onViewFile?: (fileId: string) => void;
  onRequestDocument?: (docId: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const InsightsPanel: React.FC<InsightsPanelProps> = ({
  insights,
  folderName,
  onGenerateReport,
  onViewFile,
  onRequestDocument,
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

  if (!insights) {
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

  // Parse and highlight completion percentage in summary
  const formatSummaryWithHighlight = (summary: string) => {
    // Match patterns like "92% complete" or "92%"
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

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {/* Summary Block */}
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Summary</h3>
          <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 leading-relaxed border border-slate-100">
            {formatSummaryWithHighlight(insights.summary)}
          </div>
        </div>

        {/* Red Flags Block */}
        {insights.redFlags.length > 0 && (
          <div className="flex flex-col gap-3">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
              Red Flags
              <span className="bg-red-100 text-red-700 text-[10px] px-2 py-0.5 rounded-full">
                {insights.redFlags.length} Found
              </span>
            </h3>
            {insights.redFlags.map((flag) => (
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
        {insights.missingDocuments.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Missing Documents</h3>
            <ul className="space-y-2">
              {insights.missingDocuments.map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-center justify-between gap-2 text-xs text-slate-600 p-2 rounded hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-slate-300"></span>
                    <span>{doc.name}</span>
                  </div>
                  <button
                    className="text-primary font-medium hover:underline"
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
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-sm font-bold text-white hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/10"
        >
          <span className="material-symbols-outlined text-[18px]">summarize</span>
          Generate Full Report
        </button>
      </div>
    </aside>
  );
};
