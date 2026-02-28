import { SmartFilter } from '../types/vdr.types';

// Smart Filters — work on real document properties
export const smartFilters: SmartFilter[] = [
  {
    id: 'pdfs',
    label: 'PDFs Only',
    icon: 'picture_as_pdf',
    active: false,
    filterFn: (file) => file.type === 'pdf',
  },
  {
    id: 'spreadsheets',
    label: 'Spreadsheets',
    icon: 'table_chart',
    active: false,
    filterFn: (file) => file.type === 'excel',
  },
  {
    id: 'ai-warnings',
    label: 'AI Warnings',
    icon: 'warning',
    active: false,
    filterFn: (file) => file.analysis.type === 'warning' || file.isHighlighted === true,
  },
  {
    id: 'recent',
    label: 'Last 30 Days',
    icon: 'calendar_month',
    active: false,
    filterFn: (file) => {
      const fileDate = new Date(file.date);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return fileDate >= thirtyDaysAgo;
    },
  },
];
