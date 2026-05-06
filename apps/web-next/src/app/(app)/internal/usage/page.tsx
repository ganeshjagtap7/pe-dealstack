"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/providers/UserProvider";
import { cn } from "@/lib/cn";
import { LiveFeed } from "./LiveFeed";
import { Leaderboard } from "./Leaderboard";
import { CostBreakdown } from "./CostBreakdown";

type Tab = "feed" | "leaderboard" | "breakdown";

const TAB_LABELS: Record<Tab, string> = {
  feed: "Live Feed",
  leaderboard: "User Leaderboard",
  breakdown: "Cost Breakdown",
};

export default function InternalUsagePage() {
  const { user, loading } = useUser();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("feed");

  useEffect(() => {
    if (!loading && user && !user.isInternal) {
      router.replace("/dashboard");
    }
  }, [user, loading, router]);

  if (loading) {
    return <div className="p-6 text-text-secondary">Loading…</div>;
  }

  // If not internal, return null while redirect fires.
  if (!user?.isInternal) {
    return null;
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4" style={{ color: "#003366" }}>
        Internal — AI Usage
      </h1>

      {/* Tab bar */}
      <div className="flex gap-0 mb-4 border-b border-border-subtle">
        {(["feed", "leaderboard", "breakdown"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-sm cursor-pointer border-b-2 transition-colors",
              tab === t
                ? "font-semibold"
                : "border-transparent text-text-secondary hover:bg-gray-50",
            )}
            style={
              tab === t
                ? { borderBottomColor: "#003366", color: "#003366" }
                : undefined
            }
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      {tab === "feed" && <LiveFeed />}
      {tab === "leaderboard" && <Leaderboard />}
      {tab === "breakdown" && <CostBreakdown />}
    </div>
  );
}
