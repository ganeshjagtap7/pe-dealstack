"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const FEATURES: Record<string, { icon: string; title: string; description: string }> = {
  crm: {
    icon: "groups",
    title: "CRM",
    description: "Contact & Relationship Management - Track your network of bankers, advisors, and executives.",
  },
  portfolio: {
    icon: "pie_chart",
    title: "Portfolio",
    description: "Portfolio Management - Monitor your investments, track KPIs, and manage value creation.",
  },
  default: {
    icon: "construction",
    title: "Coming Soon!",
    description: "We're working hard to bring you this feature. Stay tuned for updates!",
  },
};

function ComingSoonContent() {
  const searchParams = useSearchParams();
  const feature = searchParams.get("feature") || "default";
  const config = FEATURES[feature] || FEATURES.default;

  /* For known features, append " - Coming Soon!" to the title; for default, use title as-is */
  const displayTitle = feature !== "default" && FEATURES[feature]
    ? `${config.title} - Coming Soon!`
    : config.title;

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        {/* Icon */}
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-primary-light flex items-center justify-center">
          <span className="material-symbols-outlined text-primary text-4xl">{config.icon}</span>
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-text-main mb-2">{displayTitle}</h1>

        {/* Description */}
        <p className="text-text-secondary mb-8">{config.description}</p>

        {/* Feature Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary-light text-primary rounded-full text-sm font-medium mb-8">
          <span className="material-symbols-outlined text-[18px]">schedule</span>
          <span>In Development</span>
        </div>

        {/* Back Button */}
        <div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary-hover transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            Back to Dashboard
          </Link>
        </div>
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
