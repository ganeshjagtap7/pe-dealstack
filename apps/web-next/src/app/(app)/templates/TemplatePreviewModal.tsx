"use client";

import { useEffect } from "react";
import type { Template } from "./types";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface TemplatePreviewModalProps {
  template: Template;
  onClose: () => void;
  onUseTemplate: () => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function TemplatePreviewModal({ template, onClose, onUseTemplate }: TemplatePreviewModalProps) {
  const sections = [...(template.sections || [])].sort((a, b) => a.sortOrder - b.sortOrder);

  /* Close on Escape */
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-8">
        <div className="bg-surface-card rounded-xl shadow-float w-full max-w-3xl max-h-[90vh] flex flex-col relative">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-border-subtle">
            <h2 className="text-lg font-bold text-text-main">{template.name}</h2>
            <button onClick={onClose} className="p-1 hover:bg-background-body rounded-lg transition-colors">
              <span className="material-symbols-outlined text-text-muted">close</span>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-text-main mb-1">{template.name}</h1>
              <p className="text-sm text-text-muted">{template.description || "No description"}</p>
              <div className="flex items-center gap-3 mt-3">
                {template.isGoldStandard && (
                  <span className="bg-primary/10 text-primary text-xs font-bold px-2 py-0.5 rounded-full">
                    Gold Standard
                  </span>
                )}
                <span className="text-xs text-text-muted">{sections.length} sections</span>
                <span className="text-xs text-text-muted">{template.usageCount || 0} uses</span>
              </div>
            </div>
            <hr className="border-border-subtle mb-6" />
            {sections.map((s, i) => (
              <div
                key={s.id}
                className={`mb-4 pl-4 border-l-2 ${s.mandatory ? "border-primary" : "border-border-subtle"}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-bold text-text-main">
                    {i + 1}. {s.title}
                  </h3>
                  {s.aiEnabled && (
                    <span className="bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded font-medium">
                      AI
                    </span>
                  )}
                  {s.mandatory && (
                    <span className="bg-background-body text-text-muted text-[10px] px-1.5 py-0.5 rounded font-medium border border-border-subtle">
                      Required
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-muted">{s.description || "No description"}</p>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-4 border-t border-border-subtle bg-background-body/50">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-main transition-colors"
            >
              Close
            </button>
            <button
              onClick={onUseTemplate}
              className="px-4 py-2 bg-secondary hover:bg-secondary/90 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">play_arrow</span>
              Use This Template
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
