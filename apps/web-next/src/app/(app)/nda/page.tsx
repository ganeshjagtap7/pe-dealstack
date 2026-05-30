"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/providers/ToastProvider";
import { CreateDocModal } from "./CreateDocModal";
import { DealPicker, type PickableDeal } from "./DealPicker";
import { EditDocModal } from "./EditDocModal";
import { Gallery } from "./Gallery";
import { TemplatePicker } from "./TemplatePicker";
import type {
  LegalDocTemplate,
  LegalDocument,
  LegalDocumentWithDeal,
} from "./types";

// The NDA page is a state machine, same shape as /graphs:
//   - "gallery":  the firm-wide list (default)
//   - "picker":   modal asking which deal the new NDA belongs to
//   - "template": modal asking which template (or blank) to use
//   - "create":   create-doc form, deal + template both locked in
//   - "edit":     edit-doc form for an existing row (no deal/template step)
type View =
  | { mode: "gallery" }
  | { mode: "picker" }
  | { mode: "template"; dealId: string; dealLabel: string }
  | {
      mode: "create";
      dealId: string;
      dealLabel: string;
      template: LegalDocTemplate | null;
    }
  | { mode: "edit"; doc: LegalDocumentWithDeal };

export default function NdaPage() {
  const { showToast } = useToast();
  const searchParams = useSearchParams();

  const [docs, setDocs] = useState<LegalDocumentWithDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ mode: "gallery" });
  const [deleteTarget, setDeleteTarget] =
    useState<LegalDocumentWithDeal | null>(null);

  // Deep-link handoff from the deal page's "New NDA" button:
  //   /nda?dealId=...&dealLabel=...&create=1
  // Skip both pickers and drop straight into the template-picker step (the
  // deal context is already known on the source page). Ref-guarded so React
  // strict-mode's double-mount doesn't fire this twice.
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    if (deepLinkHandled.current) return;
    const dealId = searchParams.get("dealId");
    const create = searchParams.get("create");
    if (!dealId || !create) {
      deepLinkHandled.current = true;
      return;
    }
    const dealLabel = searchParams.get("dealLabel") || "Untitled deal";
    setView({ mode: "template", dealId, dealLabel });
    deepLinkHandled.current = true;
  }, [searchParams]);

  const loadDocs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<LegalDocumentWithDeal[]>(
        "/legal-documents?docType=NDA",
      );
      setDocs(Array.isArray(data) ? data : []);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load NDAs";
      console.warn("[nda] load failed:", err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  /* -------------------- Gallery callbacks -------------------- */

  function handleCreate() {
    setView({ mode: "picker" });
  }

  function handleEdit(doc: LegalDocumentWithDeal) {
    setView({ mode: "edit", doc });
  }

  function handleDeleteRequest(doc: LegalDocumentWithDeal) {
    setDeleteTarget(doc);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    // Optimistic remove — refetch on failure to reconcile. Backend soft-deletes
    // so the row still exists, just hidden from GET responses.
    setDocs((ds) => ds.filter((d) => d.id !== target.id));
    setDeleteTarget(null);
    try {
      await api.delete(`/legal-documents/${target.id}`);
      showToast(`Deleted "${target.title}"`, "success");
    } catch (err) {
      console.warn("[nda] delete failed:", err);
      const message =
        err instanceof Error ? err.message : "Failed to delete NDA";
      showToast(message, "error", { title: "Delete failed" });
      loadDocs();
    }
  }

  /* -------------------- Picker / Template / Create callbacks -------------------- */

  function handlePickerSelect(deal: PickableDeal) {
    setView({ mode: "template", dealId: deal.id, dealLabel: deal.label });
  }

  function handleTemplateSelect(template: LegalDocTemplate | null) {
    if (view.mode !== "template") return;
    setView({
      mode: "create",
      dealId: view.dealId,
      dealLabel: view.dealLabel,
      template,
    });
  }

  function handleCreated(doc: LegalDocument) {
    // Optimistic prepend — the API list response embeds a `deal` summary
    // which the POST response doesn't, so we synthesise one from the deal
    // label we already have on screen. The trailing refetch swaps in the
    // canonical row.
    const dealCtx =
      view.mode === "create"
        ? {
            id: view.dealId,
            target: view.dealLabel.split(" · ")[0] || null,
            projectName: null,
          }
        : { id: doc.dealId, target: null, projectName: null };
    const withDeal: LegalDocumentWithDeal = {
      ...doc,
      deal: { ...dealCtx, id: doc.dealId },
    };
    setDocs((ds) => [withDeal, ...ds]);
    showToast(`Created "${doc.title}"`, "success");
    setView({ mode: "gallery" });
    loadDocs();
  }

  function handleSaved(updated: LegalDocument) {
    setDocs((ds) =>
      ds.map((d) => (d.id === updated.id ? { ...d, ...updated, deal: d.deal } : d)),
    );
    showToast("NDA updated", "success");
    setView({ mode: "gallery" });
  }

  /* -------------------- Render -------------------- */

  // The gallery is always rendered underneath so the page never goes blank
  // when a modal is open — same UX choice /graphs makes.
  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 text-slate-900">
      <Gallery
        docs={docs}
        loading={loading}
        error={error}
        onCreate={handleCreate}
        onEdit={handleEdit}
        onDelete={handleDeleteRequest}
        onDismissError={() => setError(null)}
      />

      <DealPicker
        open={view.mode === "picker"}
        onCancel={() => setView({ mode: "gallery" })}
        onSelect={handlePickerSelect}
      />

      <TemplatePicker
        open={view.mode === "template"}
        dealLabel={view.mode === "template" ? view.dealLabel : ""}
        onCancel={() => setView({ mode: "gallery" })}
        onSelect={handleTemplateSelect}
      />

      <CreateDocModal
        open={view.mode === "create"}
        dealId={view.mode === "create" ? view.dealId : ""}
        dealLabel={view.mode === "create" ? view.dealLabel : ""}
        template={view.mode === "create" ? view.template : null}
        onCancel={() => setView({ mode: "gallery" })}
        onCreated={handleCreated}
      />

      <EditDocModal
        open={view.mode === "edit"}
        doc={view.mode === "edit" ? view.doc : null}
        onCancel={() => setView({ mode: "gallery" })}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete NDA?"
        message={
          deleteTarget
            ? `"${deleteTarget.title}" will be removed from your library. The Google Doc itself stays in your Drive — this only deletes the record here.`
            : ""
        }
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
