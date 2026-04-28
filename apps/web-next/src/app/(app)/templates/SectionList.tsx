"use client";

import { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/cn";
import type { TemplateSection } from "./types";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface SectionListProps {
  sections: TemplateSection[];
  onUpdate: (sectionId: string, data: Partial<TemplateSection>) => void;
  onDelete: (sectionId: string) => void;
  onReorder: (reordered: TemplateSection[]) => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function SectionList({ sections, onUpdate, onDelete, onReorder }: SectionListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [editMandatory, setEditMandatory] = useState(false);
  const [editApproval, setEditApproval] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  /* Drag state */
  const draggedRef = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const startEdit = useCallback((section: TemplateSection) => {
    setEditingId(section.id);
    setEditTitle(section.title);
    setEditPrompt(section.aiPrompt || "");
    setEditMandatory(section.mandatory);
    setEditApproval(!!section.requiresApproval);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
  }, []);

  const saveEdit = useCallback(
    (sectionId: string) => {
      onUpdate(sectionId, {
        title: editTitle.trim(),
        aiPrompt: editPrompt.trim(),
        mandatory: editMandatory,
        requiresApproval: editApproval,
      });
      setEditingId(null);
    },
    [editTitle, editPrompt, editMandatory, editApproval, onUpdate]
  );

  const handleConfirmDelete = useCallback(
    (sectionId: string) => {
      onDelete(sectionId);
      setConfirmDeleteId(null);
    },
    [onDelete]
  );

  /* ---- Drag handlers ---- */
  const handleDragStart = useCallback((sectionId: string) => {
    draggedRef.current = sectionId;
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, sectionId: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (draggedRef.current && draggedRef.current !== sectionId) {
        setDragOverId(sectionId);
      }
    },
    []
  );

  const handleDragLeave = useCallback(() => {
    setDragOverId(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetId: string) => {
      e.preventDefault();
      setDragOverId(null);
      const draggedId = draggedRef.current;
      if (!draggedId || draggedId === targetId) return;

      const draggedIdx = sections.findIndex((s) => s.id === draggedId);
      const targetIdx = sections.findIndex((s) => s.id === targetId);
      if (draggedIdx === -1 || targetIdx === -1) return;

      const reordered = [...sections];
      const [removed] = reordered.splice(draggedIdx, 1);
      reordered.splice(targetIdx, 0, removed);
      onReorder(reordered);
      draggedRef.current = null;
    },
    [sections, onReorder]
  );

  const handleDragEnd = useCallback(() => {
    draggedRef.current = null;
    setDragOverId(null);
  }, []);

  if (sections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <span className="material-symbols-outlined text-3xl text-text-muted mb-2">article</span>
        <p className="text-sm text-text-muted">No sections yet. Add one to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sections.map((section) => {
        const isEditing = editingId === section.id;

        if (isEditing) {
          return (
            <div key={section.id} className="p-4 bg-surface-card rounded-lg border-2 shadow-sm" style={{ borderColor: "#003366" }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]" style={{ color: "#003366" }}>
                    edit
                  </span>
                  <span className="text-sm font-bold" style={{ color: "#003366" }}>
                    {section.title}
                  </span>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Section Title</label>
                  <input
                    className="w-full text-sm border-border-subtle rounded-md shadow-sm focus:border-primary focus:ring-primary bg-background-body text-text-main px-3 py-2"
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1 text-xs font-medium text-emerald-600 mb-1">
                    <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
                    AI Prompt Configuration
                  </label>
                  <textarea
                    className="w-full text-xs border-emerald-300/30 rounded-md shadow-sm focus:border-emerald-600 focus:ring-emerald-600 bg-emerald-50/30 text-text-main resize-none p-2"
                    placeholder="Describe how AI should populate this..."
                    rows={3}
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-4 pt-1">
                  <label className="inline-flex items-center">
                    <input
                      type="checkbox"
                      checked={editMandatory}
                      onChange={(e) => setEditMandatory(e.target.checked)}
                      className="rounded border-border-subtle text-primary shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50 h-4 w-4"
                    />
                    <span className="ml-2 text-xs text-text-secondary">Mandatory Field</span>
                  </label>
                  <label className="inline-flex items-center">
                    <input
                      type="checkbox"
                      checked={editApproval}
                      onChange={(e) => setEditApproval(e.target.checked)}
                      className="rounded border-border-subtle text-primary shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50 h-4 w-4"
                    />
                    <span className="ml-2 text-xs text-text-secondary">Requires Approval</span>
                  </label>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={cancelEdit}
                    className="px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text-main transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => saveEdit(section.id)}
                    className="px-3 py-1.5 text-xs font-medium text-white rounded-md hover:opacity-90 transition-colors"
                    style={{ backgroundColor: "#003366" }}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          );
        }

        return (
          <div
            key={section.id}
            className={cn(
              "group flex items-start gap-3 p-3 bg-background-body rounded-lg border border-border-subtle hover:border-primary/30 transition-all cursor-grab",
              dragOverId === section.id && "border-t-2 border-t-primary pt-[11px]"
            )}
            draggable
            onDragStart={() => handleDragStart(section.id)}
            onDragOver={(e) => handleDragOver(e, section.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, section.id)}
            onDragEnd={handleDragEnd}
          >
            <span className="material-symbols-outlined text-text-muted text-[18px] mt-1 cursor-grab">
              drag_indicator
            </span>
            <div className="flex-1">
              <div className="flex justify-between items-center mb-1">
                <button
                  onClick={() => startEdit(section)}
                  className="text-sm font-semibold text-text-main hover:text-primary transition-colors text-left"
                >
                  {section.title}
                </button>
                {confirmDeleteId === section.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleConfirmDelete(section.id)}
                      className="text-xs font-medium text-red-600 hover:text-red-700"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="text-xs font-medium text-text-muted hover:text-text-main"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(section.id)}
                    className="material-symbols-outlined text-text-muted text-[16px] cursor-pointer hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    delete
                  </button>
                )}
              </div>
              <p className="text-xs text-text-muted mb-2">{section.description || ""}</p>
              <div className="flex items-center gap-2">
                {section.aiEnabled && (
                  <span className="bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded font-medium">
                    AI Enabled
                  </span>
                )}
                {section.mandatory && (
                  <span className="bg-background-body text-text-muted text-[10px] px-1.5 py-0.5 rounded font-medium border border-border-subtle">
                    Mandatory
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
