// Shared types for the admin / Command Center page.

export interface AdminTeamMember {
  id: string;
  name: string;
  email: string;
  title?: string;
  role?: string;
  avatar?: string;
  isActive?: boolean;
}

export interface AdminDeal {
  id: string;
  name: string;
  stage: string;
  dealSize?: number;
  teamMembers?: { userId: string }[];
}

export interface AdminTaskAssignee {
  id: string;
  name?: string;
  email?: string;
}

export interface AdminTaskDeal {
  id: string;
  name: string;
}

export type AdminTaskStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "STUCK"
  | "CANCELLED";

export interface AdminTask {
  id: string;
  title: string;
  description?: string;
  status: AdminTaskStatus;
  priority: "URGENT" | "HIGH" | "MEDIUM" | "LOW";
  dueDate: string | null;
  assignedTo?: string;
  assignee?: AdminTaskAssignee;
  dealId?: string;
  deal?: AdminTaskDeal;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAuditLog {
  id: string;
  action: string;
  entityName?: string;
  resourceName?: string;
  userEmail?: string;
  userName?: string;
  createdAt: string;
}
