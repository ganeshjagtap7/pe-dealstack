"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const FEATURES: Record<string, { icon: string; title: string; description: string }> = {
  portfolio: {
    icon: "pie_chart",
    title: "Portfolio Management",
    description: "Track portfolio company performance, valuations, and key metrics in real-time.",
  },
  default: {
    icon: "construction",
    title: "Coming Soon",
    description: "This feature is under development and will be available shortly.",
  },
};

function ComingSoonContent() {
  const searchParams = useSearchParams();
  const feature = searchParams.get("feature") || "default";
  const config = FEATURES[feature] || FEATURES.default;

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-amber-50 flex items-center justify-center">
          <span className="material-symbols-outlined text-amber-500 text-4xl">construction</span>
        </div>
        <h1 className="text-2xl font-bold text-text-main mb-2">{config.title}</h1>
        <p className="text-lg font-semibold text-text-secondary mb-2">Coming Soon</p>
        <p className="text-text-muted text-sm leading-relaxed mb-8">{config.description}</p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-6 py-2.5 text-white rounded-lg text-sm font-medium transition-colors"
          style={{ backgroundColor: "#003366" }}
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}

export default function ComingSoonPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center p-8">
          <span className="material-symbols-outlined text-4xl text-text-muted animate-spin">
            progress_activity
          </span>
        </div>
      }
    >
      <ComingSoonContent />
    </Suspense>
  );
}
