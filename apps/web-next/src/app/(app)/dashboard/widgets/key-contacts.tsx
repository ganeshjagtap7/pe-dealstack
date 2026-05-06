"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { getInitials } from "@/lib/formatters";
import { WidgetShell, WidgetEmpty, WidgetError, WidgetLoading } from "./shell";

// Ported from key-contacts.js — top 5 contacts by
// relationship score. Two API calls (list + scores) merged; no avatar on
// Contact so initials are used.
type Contact = {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  title?: string;
  company?: string;
};
type ContactScores = { scores?: Record<string, { score: number; label?: string }> };

function colorForScore(score: number): string {
  if (score >= 75) return "#10B981";
  if (score >= 50) return "#003366";
  if (score >= 25) return "#F59E0B";
  return "#6B7280";
}

export function KeyContactsWidget() {
  const [rows, setRows] = useState<Array<Contact & { score: number }> | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [contactsData, scoresData] = await Promise.all([
          api.get<{ contacts?: Contact[] } | Contact[]>("/contacts?limit=200"),
          api.get<ContactScores>("/contacts/insights/scores").catch(() => ({ scores: {} as Record<string, { score: number; label?: string }> })),
        ]);
        if (cancelled) return;
        const contacts = Array.isArray(contactsData) ? contactsData : contactsData.contacts || [];
        const scores = scoresData?.scores || {};
        const enriched = contacts
          .map((c) => ({ ...c, score: scores[c.id]?.score ?? 0 }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);
        setRows(enriched);
      } catch (err) {
        console.warn("[dashboard/key-contacts] failed to load contacts:", err);
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <WidgetShell title="Key Contacts" icon="contacts">
      {error ? (
        <WidgetError message="Could not load contacts" />
      ) : !rows ? (
        <WidgetLoading />
      ) : rows.length === 0 ? (
        <WidgetEmpty message="No contacts yet" icon="contacts" />
      ) : (
        <div className="p-2">
          {rows.map((c) => {
            const fullName = `${c.firstName || ""} ${c.lastName || ""}`.trim() || c.email || "Unknown";
            const initials = getInitials(fullName);
            const subtitle = [c.title, c.company].filter(Boolean).join(" · ") || c.email || "";
            const color = colorForScore(c.score);
            return (
              <Link
                key={c.id}
                href="/contacts"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div
                  className="w-9 h-9 rounded-full text-white text-xs font-bold flex items-center justify-center shrink-0"
                  style={{ backgroundColor: color }}
                >
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-main truncate">{fullName}</p>
                  <p className="text-xs text-text-muted truncate">{subtitle}</p>
                </div>
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                  style={{ backgroundColor: `${color}1a`, color }}
                >
                  {c.score || 0}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </WidgetShell>
  );
}
