import React from 'react';
import { FolderInsights } from '../types/vdr.types';

interface InsightsPanelProps {
  insights: FolderInsights | null;
  folderName: string;
  onGenerateReport: () => void;
  onViewFile?: (fileId: string) => void;
  onRequestDocument?: (docId: string) => void;
}

export const InsightsPanel: React.FC<InsightsPanelProps> = ({
  insights,
  folderName,
  onGenerateReport,
  onViewFile,
  onRequestDocument,
}) => {
  if (!insights) {
    return (
      <aside className="w-[320px] min-w-[320px] bg-surface-light border-l border-border-light shadow-xl z-20 flex flex-col">
        <div className="p-5 border-b border-border-light bg-gradient-to-r from-white to-primary-light/30">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined" style={{ color: '#003366' }}>smart_toy</span>
            <h2 className="text-sm font-bold text-text-main tracking-wide uppercase">AI Quick Insights</h2>
          </div>
          <p className="text-xs text-text-secondary">Select a folder to view insights</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-[320px] min-w-[320px] bg-surface-light border-l border-border-light shadow-xl z-20 flex flex-col">
      <div className="p-5 border-b border-border-light bg-gradient-to-r from-white to-primary-light/30">
        <div className="flex items-center gap-2 mb-2">
          <span className="material-symbols-outlined" style={{ color: '#003366' }}>smart_toy</span>
          <h2 className="text-sm font-bold text-text-main tracking-wide uppercase">AI Quick Insights</h2>
        </div>
        <p className="text-xs text-text-secondary">
          Analysis for <span className="font-medium text-text-main">{folderName}</span>
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {/* Summary Block */}
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-bold text-text-main uppercase tracking-wide">Summary</h3>
          <div className="rounded-lg bg-background-light p-3 text-sm text-text-secondary leading-relaxed border border-border-light">
            {insights.summary}
          </div>
        </div>

        {/* Red Flags Block */}
        {insights.redFlags.length > 0 && (
          <div className="flex flex-col gap-3">
            <h3 className="text-xs font-bold text-text-main uppercase tracking-wide flex items-center gap-2">
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
                    <p className="text-xs font-semibold text-text-main">{flag.title}</p>
                    <p className="text-xs text-text-secondary mt-1">{flag.description}</p>
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
            <h3 className="text-xs font-bold text-text-main uppercase tracking-wide">Missing Documents</h3>
            <ul className="space-y-2">
              {insights.missingDocuments.map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-center justify-between gap-2 text-xs text-text-secondary p-2 rounded hover:bg-background-light border border-transparent hover:border-border-light"
                >
                  <div className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-text-muted"></span>
                    <span>{doc.name}</span>
                  </div>
                  <button
                    className="font-medium hover:underline"
                    style={{ color: '#003366' }}
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
      <div className="p-4 border-t border-border-light">
        <button
          onClick={onGenerateReport}
          className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold text-white transition-colors shadow-lg"
          style={{ backgroundColor: '#003366', boxShadow: '0 10px 15px -3px rgba(0, 51, 102, 0.1)' }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#002855'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#003366'}
        >
          <span className="material-symbols-outlined text-[18px]">summarize</span>
          Generate Full Report
        </button>
      </div>
    </aside>
  );
};
