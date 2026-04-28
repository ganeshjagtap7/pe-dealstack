"use client";

// ---------------------------------------------------------------------------
// /deal-intake — kept as a fallback full-page route. The primary entry point
// for deal ingestion is now the IngestDealModal opened from the Header CTA,
// command palette, dashboard quick action, and deals page CTAs. This route
// remains so existing bookmarks and any direct links keep working.
//
// All form state, submission, and follow-up logic lives in IngestDealForm so
// the page and modal stay in lock-step.
// ---------------------------------------------------------------------------

import { IngestDealForm } from "@/components/deal-intake/IngestDealForm";

export default function DealIntakePage() {
  return <IngestDealForm variant="page" />;
}
