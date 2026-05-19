export type UserRole = "ADMIN" | "MEMBER" | "VIEWER";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: string; // display role (Partner, Analyst, etc.)
  systemRole: UserRole;
  avatar: string;
  preferences: Record<string, unknown>;
  isInternal: boolean;
}

export interface Deal {
  id: string;
  name: string;
  companyName?: string;
  stage: string;
  industry?: string;
  dealSize?: number;
  currency?: string;
  priority?: string;
  status?: string;
  aiThesis?: string;
  assignee?: string;
  createdAt: string;
  updatedAt: string;
  targetReturn?: number;
  revenue?: number;
  ebitda?: number;
  evMultiple?: number;
  companyId?: string;
  company?: { name?: string } | null;
  irrProjected?: number;
  mom?: number;
  icon?: string;
  lastDocument?: string;
  lastDocumentUpdated?: string;
  tags?: string[];
  // Phase 2 canonical cache: latest-period revenue/EBITDA in ACTUAL
  // DOLLARS (unitScale already applied by the API). Refreshed on every
  // FinancialStatement upsert by the extraction pipeline. Use these
  // instead of `revenue` / `ebitda` (the legacy MILLIONS-only fields)
  // when rendering deal headlines. Null until the extraction pipeline
  // or backfill script populates them.
  cachedRevenue?: number | null;
  cachedEbitda?: number | null;
  cachedEbitdaMargin?: number | null;
  cachedPeriod?: string | null;
  cachedCurrency?: string | null;
  cachedAt?: string | null;
}

export interface DealFilters {
  stage: string;
  industry: string;
  minDealSize: string;
  maxDealSize: string;
  priority: string;
  search: string;
  sortBy: string;
  sortOrder: string;
}

/**
 * Latest income-statement summary for a deal, returned by the bulk
 * `GET /api/deals/financial-summaries` endpoint. Lets cards format
 * revenue / EBITDA via `formatFinancialValue(value, unitScale)` with
 * the correct scale + currency, instead of the legacy `formatCurrency`
 * helper which assumes MILLIONS and renders "$6.7K" data as "$6.7M".
 */
export interface FinancialSummary {
  revenue: number | null;
  ebitda: number | null;
  ebitdaMargin: number | null;
  unitScale: "MILLIONS" | "THOUSANDS" | "ACTUALS" | "BILLIONS";
  currency: string;
  latestPeriod: string;
}

export type FinancialSummariesMap = Record<string, FinancialSummary>;
