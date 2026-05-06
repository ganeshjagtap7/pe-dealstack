// Shared types for the onboarding flow. Ported from *.

export type TaskId = "firm" | "cim" | "team";

export interface TaskDef {
  id: TaskId;
  title: string;
  subtitle: string;
  icon: string;
  time: string;
}

export const TASKS: TaskDef[] = [
  { id: "firm", title: "Define your investment focus", subtitle: "So we can tailor findings to your strategy", icon: "business", time: "30s" },
  { id: "cim", title: "Upload your first deal", subtitle: "A CIM, teaser, or use our sample to try it out", icon: "upload_file", time: "10s" },
  { id: "team", title: "Invite your team", subtitle: "Optional — you can do this later", icon: "group_add", time: "30s" },
];

// Firm task state
export interface FirmData {
  url: string;
  linkedin: string;
  aum: string;
  sectors: string[];
}

export const AUM_OPTIONS = ["<$1M", "$1-10M", "$10-50M", "$50-100M"];

export const DEFAULT_SECTORS = [
  "Healthcare",
  "Industrials",
  "Software",
  "Consumer",
  "Financial",
  "Tech-enabled services",
  "Energy",
];

export interface TeamInvite {
  email: string;
  role: string;
}

// Visual role labels only — these do NOT submit to the API during
// onboarding (matches legacy behavior). Matches the <select> options
// in onboarding-tasks.js team hydrator.
export const TEAM_ROLES = ["Analyst", "VP", "Partner", "Admin"];

// API response shape — matches DEFAULT_STATUS in
// apps/api/src/routes/onboarding.ts exactly. Fields I previously
// invented (`onboardingCompleted`, `onboardingSkipped`) are not
// returned by GET /onboarding/status.
export interface OnboardingStatus {
  welcomeShown?: boolean;
  checklistDismissed?: boolean;
  steps?: Record<string, boolean>;
}

// Legacy step IDs stored on the backend ↔ current 3-task flow.
// Matches the mapping in onboarding-flow.js.
export const TASK_TO_LEGACY_STEP: Record<TaskId, string> = {
  firm: "createDeal",
  cim: "uploadDocument",
  team: "inviteTeamMember",
};

export const LEGACY_STEP_TO_TASK: Record<string, TaskId> = {
  createDeal: "firm",
  uploadDocument: "cim",
  inviteTeamMember: "team",
};
