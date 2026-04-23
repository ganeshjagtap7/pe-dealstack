"use client";

import { cn } from "@/lib/cn";
import type { MemoSection } from "./components";

interface MemoOutlineSidebarProps {
  sections: MemoSection[];
  activeSection: string | null;
  setActiveSection: (id: string | null) => void;
  onAddSection: () => void;
  templateName?: string;
}

export function MemoOutlineSidebar({
  sections,
  activeSection,
  setActiveSection,
  onAddSection,
  templateName,
}: MemoOutlineSidebarProps) {
  return (
    <aside className="hidden md:flex w-64 bg-[#F8F9FA] border-r border-border-subtle flex-col shrink-0">
      {/* Sections outline */}
      <div className="p-4 border-b border-border-subtle flex-1 overflow-y-auto custom-scrollbar">
        <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">
          Sections
        </h3>
        <nav className="flex flex-col gap-1">
          {sections.map((section, idx) => (
            <button
              key={section.id}
              onClick={() => {
                setActiveSection(section.id);
                document
                  .getElementById(`section-${section.id}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className={cn(
                "flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-xs font-medium transition-colors text-left group",
                activeSection === section.id
                  ? "bg-surface-card shadow-sm border border-border-subtle text-primary"
                  : "text-text-secondary hover:bg-surface-card/60"
              )}
            >
              <span
                className={cn(
                  "w-5 h-5 shrink-0 flex items-center justify-center rounded text-[10px] font-bold",
                  activeSection === section.id
                    ? "bg-primary text-white"
                    : "bg-border-subtle text-text-muted"
                )}
              >
                {idx + 1}
              </span>
              <span className="truncate flex-1">{section.title}</span>
              {section.aiGenerated && (
                <span
                  className="material-symbols-outlined text-[12px] text-purple-500 shrink-0"
                  title="AI generated"
                >
                  auto_awesome
                </span>
              )}
            </button>
          ))}
        </nav>
        {sections.length === 0 && (
          <p className="text-[11px] text-text-muted text-center py-6">No sections yet</p>
        )}
        <button
          onClick={onAddSection}
          className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-text-secondary hover:text-primary hover:bg-white border border-dashed border-border-subtle hover:border-primary rounded-lg transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          Add Section
        </button>
      </div>

      {/* Memo Templates + Compliance cards */}
      <div className="p-4 shrink-0 space-y-3">
        <a
          href="/templates"
          className="block bg-surface-card rounded-lg p-3 border border-border-subtle hover:border-primary/50 hover:shadow-sm transition-all group"
        >
          <div className="flex items-center gap-2 text-text-secondary group-hover:text-primary font-semibold text-xs mb-1">
            <span className="material-symbols-outlined text-[16px]">description</span>
            <span>Memo Templates</span>
          </div>
          <p className="text-[11px] text-text-muted mb-2">
            Using:{" "}
            <span className="font-medium text-text-secondary">
              {templateName || "Standard IC Memo"}
            </span>
          </p>
          <div className="flex items-center gap-1 text-[10px] text-primary font-medium group-hover:underline">
            <span>Change Template</span>
            <span className="material-symbols-outlined text-[12px]">chevron_right</span>
          </div>
        </a>

        <div className="bg-primary-light rounded-lg p-3 border border-primary/20">
          <div className="flex items-center gap-2 text-primary font-semibold text-xs mb-1">
            <span className="material-symbols-outlined text-[16px]">verified_user</span>
            <span>Compliance Check</span>
          </div>
          <p className="text-[11px] text-primary/70">
            All citations are verified against the data room.
          </p>
        </div>
      </div>
    </aside>
  );
}
