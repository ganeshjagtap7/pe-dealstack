"use client";

import { usePathname } from "next/navigation";

const FEEDBACK_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSet_GfebuKpdspK7aQ8yAFUF_l5yXeFczBRoKauGEg2GlpS5g/viewform";

// Only show on pages that have feedback in the legacy app. Anchored to
// bottom-left so it never collides with right-docked panels (deal chat
// panel on /deals/[id], contact detail panel on /contacts, etc.).
const FEEDBACK_PAGES = ["/dashboard", "/deals", "/contacts", "/settings"];

export function FeedbackButton() {
  const pathname = usePathname();

  if (!FEEDBACK_PAGES.includes(pathname)) return null;

  return (
    <button
      onClick={() => window.open(FEEDBACK_URL, "_blank", "noopener,noreferrer")}
      className="fixed bottom-5 left-5 z-[999] flex items-center gap-2 px-4 py-2.5 rounded-full text-white text-sm font-semibold shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5"
      style={{ backgroundColor: "#003366" }}
      aria-label="Send feedback"
    >
      <span className="material-symbols-outlined text-[18px]">rate_review</span>
      <span>Feedback</span>
    </button>
  );
}
