"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { WidgetShell } from "./shell";
import { InboxDealsModal, type InboxDealCandidate } from "./inbox-deals-modal";

// Inbox Deal Finder — scans the user's Gmail for potential new deals.
// REVIEW-FIRST: scanning only returns candidates; a Deal is created ONLY when
// the user clicks "Create deal" on a candidate inside the review modal.

interface InboxScanResult {
  connected: boolean;
  scanned: number;
  candidates: InboxDealCandidate[];
}

const LOOKBACK_DAYS = 14;

// Inline post-scan messages — kept simple, no candidates means no modal.
type ScanNotice =
  | { kind: "disconnected" }
  | { kind: "empty" }
  | { kind: "error"; message: string };

export function InboxDealsWidget() {
  const [scanning, setScanning] = useState(false);
  const [notice, setNotice] = useState<ScanNotice | null>(null);
  const [candidates, setCandidates] = useState<InboxDealCandidate[] | null>(null);

  const handleScan = async () => {
    setScanning(true);
    setNotice(null);
    setCandidates(null);
    try {
      const result = await api.post<InboxScanResult>("/ai/scan-inbox", {
        lookbackDays: LOOKBACK_DAYS,
      });
      if (!result.connected) {
        setNotice({ kind: "disconnected" });
      } else if (result.candidates.length === 0) {
        setNotice({ kind: "empty" });
      } else {
        setCandidates(result.candidates);
      }
    } catch (err) {
      console.warn("[dashboard/inbox-deals] scan-inbox failed:", err);
      setNotice({ kind: "error", message: "Couldn't scan inbox — please try again." });
    } finally {
      setScanning(false);
    }
  };

  return (
    <>
      <WidgetShell
        title="Inbox Deal Finder"
        icon="forward_to_inbox"
        headerRight={
          <button
            type="button"
            onClick={handleScan}
            disabled={scanning}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-all disabled:opacity-60"
            style={{ backgroundColor: "#003366" }}
          >
            <span
              className={cn(
                "material-symbols-outlined text-[16px]",
                scanning && "animate-spin",
              )}
            >
              {scanning ? "progress_activity" : "forward_to_inbox"}
            </span>
            {scanning ? "Scanning..." : "Scan inbox"}
          </button>
        }
      >
        <div className="p-4">
          {notice?.kind === "error" && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
              <span className="material-symbols-outlined text-[14px]">error</span>
              {notice.message}
            </div>
          )}
          {notice?.kind === "disconnected" ? (
            <p className="text-sm text-text-muted">
              Connect Gmail in{" "}
              <Link href="/settings" className="font-medium text-primary hover:text-primary-hover">
                Settings
              </Link>{" "}
              &rarr; Integrations.
            </p>
          ) : notice?.kind === "empty" ? (
            <p className="text-sm text-text-muted">No new deals found in your recent inbox.</p>
          ) : (
            <p className="text-sm text-text-muted">
              Scan your Gmail for fresh deal opportunities.
            </p>
          )}
        </div>
      </WidgetShell>
      {candidates && candidates.length > 0 && (
        <InboxDealsModal candidates={candidates} onClose={() => setCandidates(null)} />
      )}
    </>
  );
}
