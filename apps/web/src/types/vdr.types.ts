// VDR Type Definitions

export type FolderStatus = 'ready' | 'attention' | 'reviewing' | 'restricted';

export interface Folder {
  id: string;
  name: string;
  status: FolderStatus;
  readinessPercent?: number;
  fileCount: number;
  statusLabel: string;
  statusColor: 'green' | 'orange' | 'yellow' | 'slate';
  isRestricted?: boolean;
}

export type FileType = 'excel' | 'pdf' | 'doc' | 'other';

export type AnalysisType = 'key-insight' | 'warning' | 'standard' | 'complete';

export interface FileAnalysis {
  type: AnalysisType;
  label: string;
  description: string;
  color: 'primary' | 'orange' | 'slate';
}

export interface VDRFile {
  id: string;
  name: string;
  size: string;
  type: FileType;
  analysis: FileAnalysis;
  author: {
    name: string;
    avatar: string;
  };
  date: string;
  folderId: string;
  isHighlighted?: boolean;
  tags?: string[]; // For smart filtering
}

export type RedFlagSeverity = 'high' | 'medium';

export interface RedFlag {
  id: string;
  severity: RedFlagSeverity;
  title: string;
  description: string;
  fileId?: string;
  color: 'red' | 'orange';
}

export interface MissingDocument {
  id: string;
  name: string;
}

export interface FolderInsights {
  folderId: string;
  summary: string;
  completionPercent: number;
  redFlags: RedFlag[];
  missingDocuments: MissingDocument[];
}

export interface SmartFilter {
  id: string;
  label: string;
  icon: string;
  active: boolean;
  filterFn: (file: VDRFile) => boolean;
}
