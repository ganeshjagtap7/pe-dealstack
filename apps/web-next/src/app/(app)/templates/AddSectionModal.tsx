"use client";

import { useState, useEffect } from "react";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface AddSectionModalProps {
  onAdd: (data: { title: string; description: string; aiEnabled: boolean; mandatory: boolean }) => void;
  onClose: () => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function AddSectionModal({ onAdd, onClose }: AddSectionModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [aiEnabled, setAiEnabled] = useState(false);
  const [mandatory, setMandatory] = useState(false);

  /* Close on Escape */
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleSubmit = () => {
    if (!title.trim()) return;
    onAdd({ title: title.trim(), description: description.trim(), aiEnabled, mandatory });
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="bg-surface-card rounded-xl shadow-float w-full max-w-md p-6 relative">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-text-main">Add New Section</h2>
            <button onClick={onClose} className="p-1 hover:bg-background-body rounded-lg transition-colors">
              <span className="material-symbols-outlined text-text-muted">close</span>
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-main mb-1">Section Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-border-subtle rounded-lg text-sm focus:ring-1 focus:ring-primary focus:border-primary"
                placeholder="e.g., Financial Analysis"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-main mb-1">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3 py-2 border border-border-subtle rounded-lg text-sm focus:ring-1 focus:ring-primary focus:border-primary"
                placeholder="Brief description of this section"
              />
            </div>
            <div className="flex items-center gap-4">
              <label className="inline-flex items-center">
                <input
                  type="checkbox"
                  checked={aiEnabled}
                  onChange={(e) => setAiEnabled(e.target.checked)}
                  className="rounded border-border-subtle text-primary shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50 h-4 w-4"
                />
                <span className="ml-2 text-sm text-text-secondary">AI Enabled</span>
              </label>
              <label className="inline-flex items-center">
                <input
                  type="checkbox"
                  checked={mandatory}
                  onChange={(e) => setMandatory(e.target.checked)}
                  className="rounded border-border-subtle text-primary shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50 h-4 w-4"
                />
                <span className="ml-2 text-sm text-text-secondary">Mandatory</span>
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-main transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!title.trim()}
              className="px-4 py-2 text-white rounded-lg text-sm font-medium transition-colors hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: "#003366" }}
            >
              Add Section
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
