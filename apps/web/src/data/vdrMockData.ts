import { Folder, VDRFile, FolderInsights, SmartFilter } from '../types/vdr.types';

// Mock Folders
export const mockFolders: Folder[] = [
  {
    id: '100',
    name: '100 Financials',
    status: 'ready',
    readinessPercent: 92,
    fileCount: 142,
    statusLabel: '92% Ready',
    statusColor: 'green',
  },
  {
    id: '200',
    name: '200 Legal',
    status: 'attention',
    fileCount: 84,
    statusLabel: 'Attention',
    statusColor: 'orange',
  },
  {
    id: '300',
    name: '300 Commercial',
    status: 'ready',
    readinessPercent: 88,
    fileCount: 56,
    statusLabel: '88% Ready',
    statusColor: 'slate',
  },
  {
    id: '400',
    name: '400 HR & Data',
    status: 'reviewing',
    fileCount: 23,
    statusLabel: 'Reviewing',
    statusColor: 'yellow',
  },
  {
    id: '500',
    name: '500 Intellectual Property',
    status: 'restricted',
    fileCount: 0,
    statusLabel: 'Access Restricted',
    statusColor: 'slate',
    isRestricted: true,
  },
];

// Mock Files
export const mockFiles: VDRFile[] = [
  {
    id: 'f1',
    name: 'Q3_2023_Mgmt_Accounts.xlsx',
    size: '2.4 MB',
    type: 'excel',
    analysis: {
      type: 'key-insight',
      label: 'Key Insight',
      description: 'Revenue recognition accelerated for Project X; 12% variance vs budget due to one-off supply chain adjustment.',
      color: 'primary',
    },
    author: {
      name: 'Sarah J.',
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBVizA9BciKyE7ayRCoTXxeRsfka_YnJ5n62xuKqU7jR-J1aXJP8xWUVso0-uBg0UOecGzDl93p6-s_0uUMW22UcRqNQMtbZCo3RYSFxvUT54l4CNSZzAmhVHcGQagD054InSR7kAOlLDh5Wf__LwxbMZa_kuR1IgaBF4LKye-1J_zoS5vmfDXbd-voKxpQUDy-hi5BKMcj14wPlU19dIhlJhsk0biU9fWIrZ1Wt1wYviYRkUWpXnGPuyyoSHNRMEDrhzE857tu41M',
    },
    date: 'Oct 24, 2023',
    folderId: '100',
    tags: ['revenue', 'management accounts', '2023'],
  },
  {
    id: 'f2',
    name: 'Executive_Comp_Agreements.pdf',
    size: '8.1 MB',
    type: 'pdf',
    analysis: {
      type: 'warning',
      label: 'Change of Control Clause',
      description: 'Section 4.2 triggers immediate vesting of all options upon acquisition (>50% share purchase).',
      color: 'orange',
    },
    author: {
      name: 'Mike R.',
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDY2dRWHYB43WKvJ0nBAfab8eG8xAF9vLzLPknR6nrjHMkCOFmA_W5xLT0E1pL89thaxBmzZyOviGzF9D6D2QxNsCOEP9tRBOKdZkgQjEQE83vxYbZlErOHOeKE0ByXpyNfzFQW993okM1-h65yBG1bYa5bYPl4xXTEHrx33m9VBrzasu9F8uUkrKoFHdw6zilvpBrWcAY9NKM5xJWMIsnUSz2-0Tte1_qO_QwUoypqAwp9oBx56u9dXwXSN8lDcMKkeO6RVC90oTM',
    },
    date: 'Oct 22, 2023',
    folderId: '100',
    isHighlighted: true,
    tags: ['change of control', 'executive compensation', 'high risk'],
  },
  {
    id: 'f3',
    name: 'Audit_Report_FY22.docx',
    size: '1.2 MB',
    type: 'doc',
    analysis: {
      type: 'standard',
      label: 'Standard',
      description: 'Clean opinion issued by Deloitte. No material weaknesses identified in internal controls.',
      color: 'slate',
    },
    author: {
      name: 'External',
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAYfYazRIDyPqKMfqX_dIXgsCfok8C-W-ZbgTxrhxcp-TQsRwjMW9xDcRlNUJUZcR1iu-P_Bxou41lQvpe6nCrefL8Ose3grI4vI9zVIgnLAhGbjw5fcZQkVzYRG6rqPZUWBHJUydGB_3quJas2px3WFlqT-C1ijNDDYwTz033fTxkyAHBTXNvGdPt3ptCkvLcgp7lP5P-spglepXE_3YH4ubLLcuydn-RzNcW5PrHBVwTZ9JaV5qKiOOuIy0qoiBc9-KuBLVnEu0o',
    },
    date: 'Sep 15, 2023',
    folderId: '100',
    tags: ['audit', '2022'],
  },
  {
    id: 'f4',
    name: 'Cap_Table_Current.xlsx',
    size: '0.8 MB',
    type: 'excel',
    analysis: {
      type: 'complete',
      label: 'Analysis Complete',
      description: 'Fully diluted share count matches corporate registry. 15% ESOP pool unallocated.',
      color: 'primary',
    },
    author: {
      name: 'Sarah J.',
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCgthDqvbozAFJhpY92CVRU1JJAlwGb4BlhJ-kNmO67izGfzU8IDKshRihQD8MdQPaz_QmNU7ll-Kkaw2qy-LuFpAPMKI-1frS1Q1-Zq5TWLvpR5fHQHXfUZA_CFWahrifZELNkBNGpBcdpTuC1z3-rnw2MKqLphrGJY24BWb_ScF6kQQbVKyg4MXn-Tqlo0Y8rZKQXeiIf9qCJy5qjtT41fIEQ_hc0YqRjL8EH1S7KDsZ7F4r6mZJcJi70Jaxlc02ao6W4fWwIm4A',
    },
    date: 'Oct 24, 2023',
    folderId: '100',
    tags: ['cap table', 'equity'],
  },
  // Additional files for other folders
  {
    id: 'f5',
    name: 'Shareholder_Agreement.pdf',
    size: '3.2 MB',
    type: 'pdf',
    analysis: {
      type: 'warning',
      label: 'ROFR Clause',
      description: 'Right of first refusal triggers on any equity transfer above 5%.',
      color: 'orange',
    },
    author: {
      name: 'Mike R.',
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDY2dRWHYB43WKvJ0nBAfab8eG8xAF9vLzLPknR6nrjHMkCOFmA_W5xLT0E1pL89thaxBmzZyOviGzF9D6D2QxNsCOEP9tRBOKdZkgQjEQE83vxYbZlErOHOeKE0ByXpyNfzFQW993okM1-h65yBG1bYa5bYPl4xXTEHrx33m9VBrzasu9F8uUkrKoFHdw6zilvpBrWcAY9NKM5xJWMIsnUSz2-0Tte1_qO_QwUoypqAwp9oBx56u9dXwXSN8lDcMKkeO6RVC90oTM',
    },
    date: 'Oct 20, 2023',
    folderId: '200',
    tags: ['shareholder agreement', 'ROFR', 'legal'],
  },
  {
    id: 'f6',
    name: 'EBITDA_Adjustments_FY23.xlsx',
    size: '1.5 MB',
    type: 'excel',
    analysis: {
      type: 'key-insight',
      label: 'EBITDA Adjustments',
      description: '$2.3M in one-time expenses normalized. Adjusted EBITDA margin improved to 18.5%.',
      color: 'primary',
    },
    author: {
      name: 'Sarah J.',
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBVizA9BciKyE7ayRCoTXxeRsfka_YnJ5n62xuKqU7jR-J1aXJP8xWUVso0-uBg0UOecGzDl93p6-s_0uUMW22UcRqNQMtbZCo3RYSFxvUT54l4CNSZzAmhVHcGQagD054InSR7kAOlLDh5Wf__LwxbMZa_kuR1IgaBF4LKye-1J_zoS5vmfDXbd-voKxpQUDy-hi5BKMcj14wPlU19dIhlJhsk0biU9fWIrZ1Wt1wYviYRkUWpXnGPuyyoSHNRMEDrhzE857tu41M',
    },
    date: 'Nov 02, 2023',
    folderId: '100',
    tags: ['EBITDA', 'adjustments', '2023', 'financials'],
  },
];

// Mock Insights
export const mockInsights: Record<string, FolderInsights> = {
  '100': {
    folderId: '100',
    summary: 'The financials folder is 92% complete. Key documents for FY21-23 are present. Three monthly reports from Q1 2022 appear to be draft versions.',
    completionPercent: 92,
    redFlags: [
      {
        id: 'rf1',
        severity: 'high',
        title: 'Unsigned Employment Agreement',
        description: "CFO contract in '102_HR' folder is missing a signature page.",
        fileId: 'f2',
        color: 'red',
      },
      {
        id: 'rf2',
        severity: 'medium',
        title: 'Revenue Anomaly',
        description: 'Oct 2023 revenue is 40% higher than trailing 12-month average.',
        color: 'orange',
      },
    ],
    missingDocuments: [
      { id: 'md1', name: 'Q4 2022 Board Minutes' },
      { id: 'md2', name: 'Insurance Policies 2024' },
    ],
  },
  '200': {
    folderId: '200',
    summary: 'Legal folder requires attention. 84 files uploaded, but several key contracts are pending final signatures.',
    completionPercent: 75,
    redFlags: [
      {
        id: 'rf3',
        severity: 'high',
        title: 'Missing IP Assignment',
        description: 'Founder IP assignment agreement not found in repository.',
        color: 'red',
      },
    ],
    missingDocuments: [
      { id: 'md3', name: 'Founder IP Assignment' },
      { id: 'md4', name: 'Employment Contracts (3 missing)' },
    ],
  },
  '300': {
    folderId: '300',
    summary: 'Commercial folder is 88% complete. Customer contracts and pipeline data well-documented.',
    completionPercent: 88,
    redFlags: [],
    missingDocuments: [
      { id: 'md5', name: 'Q3 2023 Sales Pipeline' },
    ],
  },
  '400': {
    folderId: '400',
    summary: 'HR & Data folder under review. 23 files uploaded, awaiting privacy compliance check.',
    completionPercent: 60,
    redFlags: [
      {
        id: 'rf4',
        severity: 'medium',
        title: 'GDPR Compliance Review Pending',
        description: 'Employee data requires GDPR compliance verification.',
        color: 'orange',
      },
    ],
    missingDocuments: [
      { id: 'md6', name: 'GDPR Compliance Certificate' },
    ],
  },
  '500': {
    folderId: '500',
    summary: 'Access restricted. Contact administrator for permissions.',
    completionPercent: 0,
    redFlags: [],
    missingDocuments: [],
  },
};

// Smart Filters Configuration
export const smartFilters: SmartFilter[] = [
  {
    id: 'change-of-control',
    label: 'Contains Change of Control',
    icon: 'gavel',
    active: false,
    filterFn: (file) => file.tags?.includes('change of control') || false,
  },
  {
    id: 'ebitda',
    label: 'EBITDA Adjustments',
    icon: 'trending_up',
    active: false,
    filterFn: (file) => file.tags?.includes('EBITDA') || file.tags?.includes('adjustments') || false,
  },
  {
    id: 'high-risk',
    label: 'High Risk Flags',
    icon: 'warning',
    active: false,
    filterFn: (file) => file.tags?.includes('high risk') || file.isHighlighted || false,
  },
  {
    id: 'fy2023',
    label: 'FY 2023 Only',
    icon: 'calendar_month',
    active: false,
    filterFn: (file) => file.tags?.includes('2023') || file.date.includes('2023') || false,
  },
];

// Collaborators
export const mockCollaborators = [
  { name: 'Collaborator 1', avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDZcPt62f21LYAAS6EJHDKyygt-2-mpDwxyS6WBiqxW48plrjG6aI8YRdWGtLCHorSBkmdfECROINYvgV08Rsl3qIusLHpEb_Bi4vxPLaypazWQQuVzkiMH7iCNLbMZh0KzgXEBq5Ph3w3UEm-SlWg1LVjRMU3WMz932ch0JbLZnVfmtyjffUdlX-3Gt8YAcfIbrEmpxjwmaYB0R4xEV2lGDTvktHOi9YGHfPuAD-emgCBlVeIWfp1vR6H7TRyNxkBtfbtCUpq_sKo' },
  { name: 'Collaborator 2', avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCLag1hMRsJ3zCPe8dwSuHtpXc-K6c_Y52vMM3lSoZWIYpvCRQLaJ9qQxx_5bEp1p1E6-vd_MN9lUggEIuQyukY1vGqlV6FFVVOmzPOGVyyIQU6URKpX6rt3hqER98aX7Mtchi5imlFBAyDsbwLMszgCpaVF5XEgy-oUA-E47EuCmFi6K5wHI578bb70rlFjXOGvL_HuLA07Fos2ziQnIsFiz-dlu8yE2nMMDH06_1mHbl-jlZcZQ2w1R0oR0MNlXkonVZTsVRj-7c' },
];
