import XLSX from 'xlsx';
import { log } from '../utils/logger.js';

export interface DealRow {
  companyName: string;
  industry?: string;
  description?: string;
  revenue?: number;
  ebitda?: number;
  stage?: string;
  notes?: string;
}

// Map common column header variations to our field names
const COLUMN_MAPPINGS: Record<string, string[]> = {
  companyName: ['Company', 'Company Name', 'Name', 'Target', 'Target Company', 'Entity'],
  industry: ['Industry', 'Sector', 'Vertical', 'Market'],
  description: ['Description', 'Business Description', 'Overview', 'Summary'],
  revenue: ['Revenue', 'Sales', 'Annual Revenue', 'Rev', 'TTM Revenue', 'Revenue ($M)'],
  ebitda: ['EBITDA', 'Adj. EBITDA', 'Adjusted EBITDA', 'Earnings', 'EBITDA ($M)'],
  stage: ['Stage', 'Pipeline Stage', 'Deal Stage', 'Status', 'Phase'],
  notes: ['Notes', 'Comments', 'Remarks', 'Details'],
};

function findFieldForHeader(header: string): string | null {
  const normalized = header.trim().toLowerCase();
  for (const [field, aliases] of Object.entries(COLUMN_MAPPINGS)) {
    if (aliases.some(alias => alias.toLowerCase() === normalized)) {
      return field;
    }
  }
  return null;
}

export function parseExcelToDealRows(buffer: Buffer): DealRow[] {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(sheet) as Record<string, any>[];

    if (rawData.length === 0) {
      log.warn('Excel file has no data rows');
      return [];
    }

    const deals = rawData
      .map((row) => {
        const mapped: Partial<DealRow> = {};
        for (const [key, value] of Object.entries(row)) {
          const field = findFieldForHeader(key);
          if (field) {
            if (field === 'revenue' || field === 'ebitda') {
              const num = parseFloat(String(value).replace(/[$,]/g, ''));
              (mapped as any)[field] = isNaN(num) ? undefined : num;
            } else {
              (mapped as any)[field] = typeof value === 'string' ? value.trim() : String(value);
            }
          }
        }
        return mapped;
      })
      .filter((row): row is DealRow => !!row.companyName && row.companyName.length > 0);

    log.info('Parsed Excel file', { totalRows: rawData.length, validDeals: deals.length });
    return deals;
  } catch (error) {
    log.error('Excel parsing error', error);
    return [];
  }
}
