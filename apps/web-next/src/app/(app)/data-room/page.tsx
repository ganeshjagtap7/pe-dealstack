"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { formatRelativeTime, formatFileSize } from "@/lib/formatters";
import { cn } from "@/lib/cn";
import Link from "next/link";

interface Deal {
  id: string;
  name: string;
  stage: string;
}

interface Document {
  id: string;
  name: string;
  fileUrl: string;
  fileSize?: number;
  mimeType?: string;
  createdAt: string;
  dealId?: string;
}

export default function DataRoomPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [selectedDeal, setSelectedDeal] = useState<string>("");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    async function loadDeals() {
      try {
        const res = await api.get<{ deals: Deal[] }>("/deals?limit=50");
        setDeals(res.deals || []);
        if (res.deals?.length > 0) {
          setSelectedDeal(res.deals[0].id);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    loadDeals();
  }, []);

  useEffect(() => {
    if (!selectedDeal) return;
    setLoading(true);
    api
      .get<{ documents: Document[] } | Document[]>(`/deals/${selectedDeal}/documents`)
      .then((res) => {
        setDocuments(Array.isArray(res) ? res : res.documents || []);
      })
      .catch(() => setDocuments([]))
      .finally(() => setLoading(false));
  }, [selectedDeal]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedDeal) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      await fetch(`/api/deals/${selectedDeal}/documents`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      // Reload documents
      const res = await api.get<{ documents: Document[] } | Document[]>(
        `/deals/${selectedDeal}/documents`
      );
      setDocuments(Array.isArray(res) ? res : res.documents || []);
    } catch {
      // ignore
    } finally {
      setUploading(false);
    }
  };

  const getDocIcon = (name: string) => {
    const ext = name?.split(".").pop()?.toLowerCase();
    if (ext === "pdf") return "picture_as_pdf";
    if (ext === "xlsx" || ext === "xls") return "table_chart";
    if (ext === "csv") return "table_view";
    if (ext === "docx" || ext === "doc") return "article";
    return "description";
  };

  const getDocColor = (name: string) => {
    const ext = name?.split(".").pop()?.toLowerCase();
    if (ext === "pdf") return "text-red-500 bg-red-50";
    if (ext === "xlsx" || ext === "xls") return "text-emerald-500 bg-emerald-50";
    if (ext === "csv") return "text-blue-500 bg-blue-50";
    if (ext === "docx" || ext === "doc") return "text-indigo-500 bg-indigo-50";
    return "text-gray-500 bg-gray-50";
  };

  return (
    <div className="flex h-full">
      {/* Deal selector sidebar */}
      <div className="w-64 border-r border-border-subtle bg-surface-card flex flex-col shrink-0">
        <div className="p-4 border-b border-border-subtle">
          <h2 className="text-sm font-bold text-text-main">Data Room</h2>
          <p className="text-xs text-text-muted mt-0.5">Select a deal to view documents</p>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {deals.map((deal) => (
            <button
              key={deal.id}
              onClick={() => setSelectedDeal(deal.id)}
              className={cn(
                "w-full text-left px-4 py-3 text-sm border-b border-border-subtle transition-colors",
                selectedDeal === deal.id
                  ? "bg-primary-light text-primary font-medium"
                  : "text-text-secondary hover:bg-background-body"
              )}
            >
              {deal.name}
            </button>
          ))}
        </div>
      </div>

      {/* Document area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border-subtle bg-surface-card">
          <div>
            <h1 className="text-lg font-bold text-text-main">
              {deals.find((d) => d.id === selectedDeal)?.name || "Documents"}
            </h1>
            <p className="text-xs text-text-muted">
              {documents.length} document{documents.length !== 1 ? "s" : ""}
            </p>
          </div>
          <label
            className="flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-medium cursor-pointer transition-colors hover:opacity-90"
            style={{ backgroundColor: "#003366" }}
          >
            <span className="material-symbols-outlined text-[18px]">upload_file</span>
            {uploading ? "Uploading..." : "Upload"}
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {loading ? (
            <div className="text-center py-16 text-text-muted text-sm">Loading documents...</div>
          ) : documents.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-border-subtle rounded-lg">
              <span className="material-symbols-outlined text-4xl text-text-muted">
                folder_open
              </span>
              <p className="mt-2 text-sm text-text-muted">No documents yet</p>
              <p className="text-xs text-text-muted mt-1">Upload files to get started</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border-subtle bg-surface-card hover:shadow-card transition-all group"
                >
                  <div
                    className={cn(
                      "size-10 rounded-lg flex items-center justify-center shrink-0",
                      getDocColor(doc.name)
                    )}
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {getDocIcon(doc.name)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-main truncate">{doc.name}</p>
                    <p className="text-xs text-text-muted">
                      {formatFileSize(doc.fileSize)} &middot; {formatRelativeTime(doc.createdAt)}
                    </p>
                  </div>
                  <button
                    onClick={() => window.open(`/api/documents/${doc.id}/download`, "_blank")}
                    className="opacity-0 group-hover:opacity-100 p-2 rounded-md hover:bg-primary-light text-text-muted hover:text-primary transition-all"
                  >
                    <span className="material-symbols-outlined text-[18px]">download</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
