"use client";

import { useState, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";

// ─── CSV parsing (matches legacy contacts-csv.js) ─────────

interface ParsedContact {
  firstName: string; lastName: string; email: string; phone: string;
  title: string; company: string; type: string; linkedinUrl: string;
}

function parseCSV(text: string): ParsedContact[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  function parseRow(line: string): string[] {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === "," && !inQuotes) { fields.push(current.trim()); current = ""; continue; }
      current += ch;
    }
    fields.push(current.trim());
    return fields;
  }

  const headers = parseRow(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z]/g, ""));
  const fieldMap: Record<string, number> = {};

  headers.forEach((h, i) => {
    if (["firstname", "first", "fname"].includes(h)) fieldMap.firstName = i;
    else if (["lastname", "last", "lname", "surname"].includes(h)) fieldMap.lastName = i;
    else if (["email", "emailaddress", "mail"].includes(h)) fieldMap.email = i;
    else if (["phone", "phonenumber", "mobile", "tel"].includes(h)) fieldMap.phone = i;
    else if (["title", "jobtitle", "position", "role"].includes(h)) fieldMap.title = i;
    else if (["company", "organization", "org", "companyname"].includes(h)) fieldMap.company = i;
    else if (["type", "contacttype", "category"].includes(h)) fieldMap.type = i;
    else if (["linkedin", "linkedinurl", "linkedinprofile"].includes(h)) fieldMap.linkedinUrl = i;
  });

  if (fieldMap.firstName === undefined && fieldMap.lastName === undefined) {
    const nameIdx = headers.findIndex((h) => h === "name" || h === "fullname");
    if (nameIdx >= 0) fieldMap.fullName = nameIdx;
  }

  const validTypes = ["BANKER", "ADVISOR", "EXECUTIVE", "LP", "LEGAL", "OTHER"];
  const contacts: ParsedContact[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseRow(lines[i]);
    if (cols.every((c) => !c)) continue;

    let firstName = "", lastName = "";
    if (fieldMap.fullName !== undefined) {
      const parts = (cols[fieldMap.fullName] || "").split(/\s+/);
      firstName = parts[0] || "";
      lastName = parts.slice(1).join(" ") || "";
    } else {
      firstName = cols[fieldMap.firstName] || "";
      lastName = cols[fieldMap.lastName] || "";
    }
    if (!firstName && !lastName) continue;

    let type = (cols[fieldMap.type] || "").toUpperCase();
    if (!validTypes.includes(type)) type = "OTHER";

    contacts.push({
      firstName, lastName,
      email: cols[fieldMap.email] || "",
      phone: cols[fieldMap.phone] || "",
      title: cols[fieldMap.title] || "",
      company: cols[fieldMap.company] || "",
      type,
      linkedinUrl: cols[fieldMap.linkedinUrl] || "",
    });
  }
  return contacts;
}

// ─── CSV Import Modal ─────────────────────────────────────

type Step = "upload" | "preview" | "result";

export function CSVImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState<Step>("upload");
  const [parsedContacts, setParsedContacts] = useState<ParsedContact[]>([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: number; failed: number; errors?: string[] } | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith(".csv")) { alert("Please select a CSV file."); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const contacts = parseCSV(e.target?.result as string);
      if (contacts.length === 0) {
        alert("No valid contacts found in CSV. Make sure it has First Name and Last Name columns.");
        return;
      }
      setParsedContacts(contacts);
      setStep("preview");
    };
    reader.readAsText(file);
  }, []);

  function resetModal() {
    setParsedContacts([]);
    setStep("upload");
    setImportError(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function submitImport() {
    setImporting(true);
    setImportError(null);
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch("/api/contacts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ contacts: parsedContacts }),
      });
      const data = await res.json();
      setResult({ imported: data.imported || 0, failed: data.failed || 0, errors: data.errors });
      setStep("result");
    } catch {
      setImportError("Import failed. Please try again.");
    } finally { setImporting(false); }
  }

  const preview = parsedContacts.slice(0, 50);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface-card rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[22px]">upload_file</span>
            <h2 className="text-lg font-bold text-text-main">Import Contacts from CSV</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 transition-colors">
            <span className="material-symbols-outlined text-text-muted">close</span>
          </button>
        </div>

        {/* Step 1: Upload */}
        {step === "upload" && (
          <div className="p-6">
            <div
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${dragActive ? "border-primary bg-blue-50/50" : "border-border-subtle hover:border-primary/40"}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => { e.preventDefault(); setDragActive(false); const file = e.dataTransfer.files[0]; if (file) handleFile(file); }}
            >
              <span className="material-symbols-outlined text-text-muted text-4xl mb-3">cloud_upload</span>
              <p className="text-sm font-medium text-text-main mb-1">Drop your CSV file here or click to browse</p>
              <p className="text-xs text-text-muted">Required columns: First Name, Last Name. Optional: Email, Phone, Title, Company, Type</p>
            </div>
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            <div className="mt-4 flex items-center gap-2 text-xs text-text-muted">
              <span className="material-symbols-outlined text-[14px]">lightbulb</span>
              Tip: Export your existing contacts first to see the expected CSV format.
            </div>
          </div>
        )}

        {/* Step 2: Preview */}
        {step === "preview" && (
          <div>
            <div className="px-6 py-3 bg-slate-50 border-b border-border-subtle flex items-center justify-between">
              <p className="text-sm text-text-main"><strong>{parsedContacts.length}</strong> contacts ready to import</p>
              <button onClick={resetModal} className="text-xs text-text-muted hover:text-text-main transition-colors flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">refresh</span>Choose different file
              </button>
            </div>
            <div className="px-6 py-4 max-h-[40vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle">
                    <th className="text-left py-2 text-[11px] font-bold text-text-muted uppercase">Name</th>
                    <th className="text-left py-2 text-[11px] font-bold text-text-muted uppercase">Email</th>
                    <th className="text-left py-2 text-[11px] font-bold text-text-muted uppercase">Company</th>
                    <th className="text-left py-2 text-[11px] font-bold text-text-muted uppercase">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((c, i) => (
                    <tr key={i} className="border-b border-border-subtle">
                      <td className="py-2 text-text-main font-medium">{c.firstName} {c.lastName}</td>
                      <td className="py-2 text-text-muted">{c.email || "--"}</td>
                      <td className="py-2 text-text-muted">{c.company || "--"}</td>
                      <td className="py-2"><span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-text-muted">{c.type}</span></td>
                    </tr>
                  ))}
                  {parsedContacts.length > 50 && (
                    <tr><td colSpan={4} className="py-2 text-xs text-text-muted text-center">...and {parsedContacts.length - 50} more</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t border-border-subtle flex items-center justify-between">
              {importError && <p className="text-xs text-red-600">{importError}</p>}
              <div className="flex items-center gap-3 ml-auto">
                <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-main transition-colors">Cancel</button>
                <button onClick={submitImport} disabled={importing} className="flex items-center gap-2 px-5 py-2 text-white rounded-lg shadow-sm hover:opacity-90 transition-colors text-sm font-medium disabled:opacity-50" style={{ backgroundColor: "#003366" }}>
                  {importing ? <><span className="material-symbols-outlined text-[18px] animate-spin">sync</span>Importing...</> : <><span className="material-symbols-outlined text-[18px]">upload</span>Import All</>}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Result */}
        {step === "result" && result && (
          <div className="p-6 text-center">
            {result.imported > 0 ? (
              <>
                <span className="material-symbols-outlined text-emerald-500 text-5xl mb-3">check_circle</span>
                <h3 className="text-lg font-bold text-text-main mb-2">{result.imported} contacts imported!</h3>
                <p className="text-sm text-text-muted mb-6">
                  {result.failed > 0 ? `${result.failed} contact${result.failed > 1 ? "s" : ""} failed to import.` : "All contacts were imported successfully."}
                </p>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-red-500 text-5xl mb-3">error</span>
                <h3 className="text-lg font-bold text-text-main mb-2">Import failed</h3>
                <p className="text-sm text-text-muted mb-6">{result.errors?.[0] || "No contacts could be imported."}</p>
              </>
            )}
            <button onClick={() => { onClose(); onDone(); }} className="px-5 py-2 text-white rounded-lg shadow-sm hover:opacity-90 transition-colors text-sm font-medium" style={{ backgroundColor: "#003366" }}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
