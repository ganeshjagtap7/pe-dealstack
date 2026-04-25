"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";

type Role = "VIEWER" | "MEMBER" | "ADMIN";

const ROLES: { value: Role; label: string; description: string }[] = [
  { value: "VIEWER", label: "Analyst", description: "View-only access" },
  { value: "MEMBER", label: "Associate", description: "Can edit deals" },
  { value: "ADMIN", label: "Admin", description: "Full access" },
];

interface DealOption {
  id: string;
  name: string;
}

interface InviteRow {
  id: number;
  email: string;
  role: Role;
  deals: DealOption[];
}

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

function RowDealPicker({
  row,
  available,
  onAdd,
  onRemove,
}: {
  row: InviteRow;
  available: DealOption[];
  onAdd: (deal: DealOption) => void;
  onRemove: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selectedIds = new Set(row.deals.map((d) => d.id));
  const filtered = available.filter(
    (d) => !selectedIds.has(d.id) && d.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="relative" ref={ref}>
      <div
        onClick={() => setOpen(true)}
        className="relative w-full rounded-lg border border-[#EBEBEB] bg-white min-h-[48px] px-2 py-1.5 flex items-center flex-wrap gap-2 focus-within:ring-1 focus-within:ring-[#003366] focus-within:border-[#003366] transition-all cursor-text group"
      >
        {row.deals.map((deal) => (
          <div
            key={deal.id}
            className="bg-[#E6EDF5] border border-[#CCDBE8] text-[#003366] font-medium px-2 py-1 rounded-md flex items-center gap-1 text-xs"
          >
            <span>{deal.name}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(deal.id);
              }}
              className="hover:text-[#4A6D8A] text-[#8099B3]"
            >
              <span className="material-symbols-outlined text-[14px]">close</span>
            </button>
          </div>
        ))}
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={row.deals.length > 0 ? "Add deal..." : "Search workspaces..."}
          className="bg-transparent border-none focus:ring-0 text-[#343A40] text-sm placeholder-[#868E96]/40 p-0 h-6 min-w-[60px] flex-1 outline-none"
        />
        <span className="material-symbols-outlined absolute right-3 text-[#868E96]/60 pointer-events-none text-lg group-focus-within:text-[#003366] transition-colors">
          search
        </span>
      </div>
      {open && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-[#EBEBEB] rounded-lg shadow-lg py-1 max-h-48 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-2 text-sm text-[#868E96]">
              {available.length === 0 ? "No deals available" : "No matching deals"}
            </div>
          ) : (
            filtered.map((deal) => (
              <button
                key={deal.id}
                type="button"
                onClick={() => {
                  onAdd(deal);
                  setQuery("");
                }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-[#F0F4F8] text-[#343A40] transition-colors"
              >
                {deal.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function InviteTeamModal({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<InviteRow[]>([
    { id: 1, email: "", role: "MEMBER", deals: [] },
  ]);
  const nextId = useRef(2);
  const [availableDeals, setAvailableDeals] = useState<DealOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error" | "warning"; text: string } | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<Array<{ id: string; name: string }> | { deals: Array<{ id: string; name: string }> }>(
          "/deals?status=ACTIVE",
        );
        const list = Array.isArray(data) ? data : data.deals || [];
        setAvailableDeals(list.map((d) => ({ id: d.id, name: d.name })));
      } catch {
        setAvailableDeals([]);
      }
    })();
  }, []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const validCount = useMemo(() => rows.filter((r) => isValidEmail(r.email)).length, [rows]);

  const updateRow = (id: number, patch: Partial<InviteRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const addRow = () =>
    setRows((prev) => [...prev, { id: nextId.current++, email: "", role: "MEMBER", deals: [] }]);

  const removeRow = (id: number) =>
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));

  const handleSubmit = async () => {
    const valid = rows.filter((r) => isValidEmail(r.email));
    if (valid.length === 0) {
      setMessage({ type: "error", text: "Please enter at least one valid email address" });
      return;
    }

    setSubmitting(true);
    setMessage(null);
    setInviteUrl(null);

    let successCount = 0;
    let emailFailCount = 0;
    let lastInviteUrl: string | null = null;
    const errors: string[] = [];

    for (const row of valid) {
      try {
        const data = await api.post<{ emailSent?: boolean; inviteUrl?: string }>("/invitations", {
          email: row.email,
          role: row.role,
        });
        successCount++;
        if (data?.emailSent === false) {
          emailFailCount++;
          if (data.inviteUrl) lastInviteUrl = data.inviteUrl;
        }
      } catch (err) {
        errors.push(`${row.email}: ${err instanceof Error ? err.message : "Failed"}`);
      }
    }

    setSubmitting(false);

    if (successCount > 0) {
      if (emailFailCount === successCount && lastInviteUrl) {
        setInviteUrl(lastInviteUrl);
        setMessage({
          type: "warning",
          text: "Invitation created but email could not be sent. Copy the link to share manually.",
        });
      } else if (emailFailCount > 0) {
        setMessage({
          type: "warning",
          text: `${successCount - emailFailCount} sent. ${emailFailCount} email${emailFailCount > 1 ? "s" : ""} failed to deliver.`,
        });
      } else {
        setMessage({
          type: "success",
          text: `${successCount} invitation${successCount > 1 ? "s" : ""} sent successfully.`,
        });
        setTimeout(() => onClose(), 1200);
      }
    } else if (errors.length > 0) {
      setMessage({ type: "error", text: errors[0] });
    }
  };

  return (
    <div className="fixed inset-0 z-[10000]">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-xl"
        data-modal-overlay
        onClick={onClose}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          className="w-full max-w-[960px] max-h-[90vh] flex flex-col bg-[#FAFAFA] border border-[#EBEBEB] rounded-2xl shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-8 pt-8 pb-4 flex justify-between items-start">
            <div className="flex flex-col gap-1">
              <h3 className="text-[#343A40] tracking-tight text-2xl font-bold leading-tight">
                Invite Team Members
              </h3>
              <p className="text-[#868E96] text-base font-normal leading-normal">
                Add colleagues to your organization and assign deal access.
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-[#868E96] hover:text-[#343A40] transition-colors p-2 rounded-full hover:bg-black/5"
              aria-label="Close"
            >
              <span className="material-symbols-outlined text-2xl">close</span>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-8 py-2">
            <div className="space-y-4">
              {rows.map((row, index) => {
                const isFirst = index === 0;
                const emailValid = isValidEmail(row.email);
                return (
                  <div
                    key={row.id}
                    className={`flex flex-col lg:flex-row gap-4 ${isFirst ? "pt-2" : "pt-4"}`}
                  >
                    {/* Email */}
                    <div className="flex-[2]">
                      {isFirst && (
                        <label className="block mb-2 text-sm font-medium text-[#868E96]">
                          Email Address
                        </label>
                      )}
                      <div className="relative">
                        <input
                          type="email"
                          value={row.email}
                          onChange={(e) => updateRow(row.id, { email: e.target.value })}
                          placeholder="colleague@firm.com"
                          className="block w-full rounded-lg border border-[#EBEBEB] bg-white text-[#343A40] placeholder-[#868E96]/60 focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/20 h-12 px-4 text-sm transition-all outline-none"
                        />
                        {emailValid && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-600 material-symbols-outlined text-lg">
                            check_circle
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Role */}
                    <div className="flex-1 min-w-[140px]">
                      {isFirst && (
                        <label className="block mb-2 text-sm font-medium text-[#868E96]">
                          Role
                        </label>
                      )}
                      <select
                        value={row.role}
                        onChange={(e) => updateRow(row.id, { role: e.target.value as Role })}
                        className="block w-full rounded-lg border border-[#EBEBEB] bg-white text-[#343A40] focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/20 h-12 px-4 text-sm transition-all cursor-pointer outline-none appearance-none pr-10"
                        style={{
                          backgroundImage:
                            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239CA3AF'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E\")",
                          backgroundPosition: "right 0.5rem center",
                          backgroundRepeat: "no-repeat",
                          backgroundSize: "1.5em 1.5em",
                        }}
                      >
                        {ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Workspaces */}
                    <div className="flex-[2]">
                      {isFirst && (
                        <label className="block mb-2 text-sm font-medium text-[#868E96]">
                          Workspaces
                        </label>
                      )}
                      <RowDealPicker
                        row={row}
                        available={availableDeals}
                        onAdd={(deal) =>
                          updateRow(row.id, { deals: [...row.deals, deal] })
                        }
                        onRemove={(dealId) =>
                          updateRow(row.id, {
                            deals: row.deals.filter((d) => d.id !== dealId),
                          })
                        }
                      />
                    </div>

                    {/* Delete */}
                    <div className={`flex ${isFirst ? "items-end pb-1 lg:pb-1" : "items-center"}`}>
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        disabled={rows.length === 1}
                        title="Remove"
                        className={`text-[#868E96] hover:text-red-500 transition-colors p-1.5 rounded-lg hover:bg-black/5 ${
                          rows.length === 1 ? "opacity-30 cursor-not-allowed" : ""
                        }`}
                      >
                        <span className="material-symbols-outlined">delete</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Action Buttons Row */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mt-6 gap-4 border-t border-[#EBEBEB] pt-6 pb-2">
              <button
                type="button"
                onClick={addRow}
                className="flex items-center gap-2 text-[#003366] hover:text-blue-700 font-medium text-sm transition-colors group px-2 py-1 rounded-md hover:bg-[#E6EDF5]"
              >
                <span className="material-symbols-outlined text-xl group-hover:scale-110 transition-transform">
                  add_circle
                </span>
                Add another team member
              </button>
              <button
                type="button"
                className="flex items-center gap-2 text-[#868E96] hover:text-[#343A40] font-medium text-sm transition-colors px-2 py-1 rounded-md hover:bg-black/5"
                title="Coming soon"
              >
                <span className="material-symbols-outlined text-xl">upload_file</span>
                Bulk import via CSV
              </button>
            </div>

            {/* Access Control Info */}
            <div className="mt-4 bg-[#F0F4F8] border border-[#E0E8F0] rounded-lg p-3 flex gap-3 items-start">
              <span className="material-symbols-outlined text-[#003366] text-xl mt-0.5">info</span>
              <div className="text-sm text-[#868E96]">
                <span className="text-[#343A40] font-medium">Access Control:</span> Analysts have{" "}
                <span className="text-[#343A40]">view-only</span> access to assigned deal workspaces.
                Associates can edit models but cannot invite external guests.
              </div>
            </div>

            {message && (
              <div
                className={`mt-4 rounded-lg p-3 text-sm border ${
                  message.type === "success"
                    ? "bg-green-50 border-green-200 text-green-700"
                    : message.type === "warning"
                      ? "bg-amber-50 border-amber-200 text-amber-800"
                      : "bg-red-50 border-red-200 text-red-700"
                }`}
              >
                {message.text}
                {inviteUrl && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      readOnly
                      value={inviteUrl}
                      className="flex-1 text-xs bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-700 select-all"
                    />
                    <button
                      type="button"
                      onClick={() => navigator.clipboard?.writeText(inviteUrl)}
                      className="px-3 py-2 text-xs font-medium text-white rounded-lg whitespace-nowrap"
                      style={{ backgroundColor: "#003366" }}
                    >
                      Copy
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-8 py-6 bg-white border-t border-[#EBEBEB] flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="text-sm text-[#868E96] hidden sm:block">
              Inviting{" "}
              <span className="text-[#343A40] font-semibold">
                {validCount} user{validCount !== 1 ? "s" : ""}
              </span>{" "}
              to organization
            </div>
            <div className="flex gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 sm:flex-none px-6 py-3 rounded-lg border border-[#EBEBEB] text-[#343A40] font-medium text-sm hover:bg-black/5 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || validCount === 0}
                className="flex-1 sm:flex-none px-6 py-3 rounded-lg text-white font-medium text-sm shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-60"
                style={{ backgroundColor: "#003366" }}
              >
                {submitting ? (
                  <>
                    <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                    Sending...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-lg">send</span>
                    Send Invitations
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
