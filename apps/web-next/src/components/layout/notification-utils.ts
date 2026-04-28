// Shared types + helpers for the Notification Center.
// Extracted from NotificationPanel.tsx to keep that file under 500 lines.

export type NotificationType =
  | "DEAL_UPDATE"
  | "DOCUMENT_UPLOADED"
  | "MENTION"
  | "AI_INSIGHT"
  | "TASK_ASSIGNED"
  | "COMMENT"
  | "SYSTEM"
  | "STAGE_CHANGE"
  | "FINANCIAL_READY"
  | "INVITATION";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  isRead: boolean;
  createdAt: string;
  dealId?: string;
  link?: string;
  Deal?: { id: string; name: string };
}

export interface NotificationsResponse {
  notifications: NotificationItem[];
  unreadCount: number;
}

export type FilterTab = "all" | "unread" | "mentions";
export type TimeGroup = "Today" | "Yesterday" | "This Week" | "Older";

// ── Type → icon/colour config (10 types, matching legacy) ───────────────────
export const TYPE_CONFIG: Record<
  NotificationType,
  { icon: string; color: string; bg: string; label: string }
> = {
  DEAL_UPDATE:       { icon: "trending_up",     color: "#003366", bg: "#E6EEF5", label: "Deal" },
  DOCUMENT_UPLOADED: { icon: "upload_file",     color: "#2563EB", bg: "#EFF6FF", label: "Document" },
  MENTION:           { icon: "alternate_email", color: "#7C3AED", bg: "#F5F3FF", label: "Mention" },
  AI_INSIGHT:        { icon: "auto_awesome",    color: "#D97706", bg: "#FFFBEB", label: "AI" },
  TASK_ASSIGNED:     { icon: "task_alt",        color: "#059669", bg: "#ECFDF5", label: "Task" },
  COMMENT:           { icon: "comment",         color: "#0891B2", bg: "#ECFEFF", label: "Comment" },
  SYSTEM:            { icon: "info",            color: "#6B7280", bg: "#F3F4F6", label: "System" },
  STAGE_CHANGE:      { icon: "swap_horiz",      color: "#003366", bg: "#E6EEF5", label: "Stage" },
  FINANCIAL_READY:   { icon: "table_chart",     color: "#059669", bg: "#ECFDF5", label: "Financial" },
  INVITATION:        { icon: "mail",            color: "#7C3AED", bg: "#F5F3FF", label: "Invite" },
};

export function getTypeConfig(type: NotificationType) {
  return TYPE_CONFIG[type] || TYPE_CONFIG.SYSTEM;
}

// ── Time grouping ─────────────────────────────────────────────────────────────
// Buckets a notification's createdAt into Today / Yesterday / This Week / Older.
const TIME_GROUP_ORDER: TimeGroup[] = [
  "Today", "Yesterday", "This Week", "Older",
];

export function getTimeGroup(dateStr: string): TimeGroup {
  const date = new Date(dateStr);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return "Today";

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";

  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 7) return "This Week";
  return "Older";
}

export function groupNotifications(
  list: NotificationItem[],
): Map<TimeGroup, NotificationItem[]> {
  const groups = new Map<TimeGroup, NotificationItem[]>();
  for (const n of list) {
    const group = getTimeGroup(n.createdAt);
    const existing = groups.get(group);
    if (existing) existing.push(n);
    else groups.set(group, [n]);
  }
  // Preserve canonical group order
  const sorted = new Map<TimeGroup, NotificationItem[]>();
  for (const key of TIME_GROUP_ORDER) {
    const items = groups.get(key);
    if (items) sorted.set(key, items);
  }
  return sorted;
}

// ── Filter logic ─────────────────────────────────────────────────────────────
// Per spec: All / Unread / Mentions. The Mentions tab shows MENTION + COMMENT
// (any notification that's effectively someone tagging you).
const MENTION_TYPES: NotificationType[] = ["MENTION", "COMMENT"];

export function filterNotifications(
  list: NotificationItem[],
  filter: FilterTab,
): NotificationItem[] {
  switch (filter) {
    case "unread":   return list.filter((n) => !n.isRead);
    case "mentions": return list.filter((n) => MENTION_TYPES.includes(n.type));
    default:         return list;
  }
}

export const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "all",      label: "All" },
  { key: "unread",   label: "Unread" },
  { key: "mentions", label: "Mentions" },
];

export const EMPTY_MESSAGES: Record<FilterTab, { title: string; sub: string }> = {
  all:      { title: "No notifications yet",       sub: "Notifications will appear here as your deals progress" },
  unread:   { title: "You're all caught up!",      sub: "No unread notifications" },
  mentions: { title: "No mentions yet",            sub: "When someone @-mentions or comments on you, it will show here" },
};

// Resolve the navigation target for a notification. Prefers an explicit link
// from the API; falls back to /deals/:dealId if a dealId is present.
export function getNotificationLink(n: NotificationItem): string | null {
  if (n.link) return n.link;
  if (n.dealId) return `/deals/${n.dealId}`;
  return null;
}
