"use client";

import { ComponentType } from "react";
import { QuickActionsWidget } from "./quick-actions";
import { QuickNotesWidget } from "./quick-notes";
import { DealFunnelWidget } from "./deal-funnel";
import { UpcomingDeadlinesWidget } from "./upcoming-deadlines";
import { MarketMultiplesWidget } from "./market-multiples";
import { CalendarWidget } from "./calendar";
import { KeyContactsWidget } from "./key-contacts";
import { RecentActivityWidget } from "./recent-activity";
import { TeamPerformanceWidget } from "./team-performance";
import { DocumentAlertsWidget } from "./document-alerts";
import { WatchlistWidget } from "./watchlist";

export type WidgetId =
  | "quick-actions"
  | "quick-notes"
  | "deal-funnel"
  | "upcoming-deadlines"
  | "market-multiples"
  | "calendar"
  | "key-contacts"
  | "recent-activity"
  | "team-performance"
  | "document-alerts"
  | "watchlist";

export interface WidgetMeta {
  id: WidgetId;
  title: string;
  description: string;
  icon: string;
  Component: ComponentType;
}

// Order here is the default display order when a widget is enabled.
export const WIDGETS: WidgetMeta[] = [
  {
    id: "quick-actions",
    title: "Quick Actions",
    description: "Shortcuts to New Deal, Upload Doc, Add Contact.",
    icon: "bolt",
    Component: QuickActionsWidget,
  },
  {
    id: "quick-notes",
    title: "Quick Notes",
    description: "Personal scratchpad. Saves to this browser only.",
    icon: "edit_note",
    Component: QuickNotesWidget,
  },
  {
    id: "deal-funnel",
    title: "Deal Funnel",
    description: "Active deals grouped by pipeline stage.",
    icon: "filter_alt",
    Component: DealFunnelWidget,
  },
  {
    id: "upcoming-deadlines",
    title: "Upcoming Deadlines",
    description: "Tasks due in the next 14 days, color-coded by urgency.",
    icon: "event",
    Component: UpcomingDeadlinesWidget,
  },
  {
    id: "calendar",
    title: "This Week",
    description: "Tasks + deal close dates for the next 7 days.",
    icon: "calendar_month",
    Component: CalendarWidget,
  },
  {
    id: "key-contacts",
    title: "Key Contacts",
    description: "Top 5 contacts by relationship score.",
    icon: "contacts",
    Component: KeyContactsWidget,
  },
  {
    id: "recent-activity",
    title: "Recent Activity",
    description: "Latest audit events across your org.",
    icon: "rss_feed",
    Component: RecentActivityWidget,
  },
  {
    id: "team-performance",
    title: "Team Performance",
    description: "Active deals + open tasks + capacity per teammate.",
    icon: "groups",
    Component: TeamPerformanceWidget,
  },
  {
    id: "document-alerts",
    title: "Document Alerts",
    description: "Documents awaiting review or AI analysis.",
    icon: "report",
    Component: DocumentAlertsWidget,
  },
  {
    id: "watchlist",
    title: "Watchlist",
    description: "Companies you're tracking outside the pipeline.",
    icon: "visibility",
    Component: WatchlistWidget,
  },
  {
    id: "market-multiples",
    title: "Market Multiples",
    description: "Static EV/EBITDA + EV/Revenue reference table.",
    icon: "insights",
    Component: MarketMultiplesWidget,
  },
];

export const DEFAULT_VISIBLE: WidgetId[] = ["quick-actions", "deal-funnel", "upcoming-deadlines"];
