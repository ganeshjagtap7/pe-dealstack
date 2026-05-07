export interface UsageEventRow {
  id: string;
  userId: string;
  organizationId: string;
  operation: string;
  model: string | null;
  provider: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  units: number | null;
  costUsd: number | null;
  credits: number | null;
  status: string;
  durationMs: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  User?: { email?: string } | null;
  Organization?: { name?: string } | null;
}

export interface LeaderboardRow {
  userId: string;
  organizationId: string;
  calls: number;
  tokens: number;
  costUsd: number;
  credits: number;
  topOperation: string;
  email?: string;
  role?: string;
  isThrottled?: boolean;
  isBlocked?: boolean;
  orgName?: string;
}

export interface CostBreakdownSeriesPoint {
  day: string;
  byOperation: Record<string, number>;
}

export interface CostBreakdownReconciliationRow {
  operation: string;
  costUsd: number;
  credits: number;
}
