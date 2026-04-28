export interface TemplateSection {
  id: string;
  title: string;
  description: string;
  aiEnabled: boolean;
  mandatory: boolean;
  sortOrder: number;
  aiPrompt?: string;
  requiresApproval?: boolean;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  isGoldStandard?: boolean;
  isLegacy?: boolean;
  isActive: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt?: string;
  sections: TemplateSection[];
  permissions: string;
}
