export type UserRole = "ADMIN" | "MEMBER" | "VIEWER";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: string; // display role (Partner, Analyst, etc.)
  systemRole: UserRole;
  avatar: string;
  preferences: Record<string, unknown>;
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
