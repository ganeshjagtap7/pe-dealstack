import multer from 'multer';
import { createRequire } from 'module';
import { log } from '../utils/logger.js';

// Use createRequire to load CommonJS pdf-parse v1.x module
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

// Helper function to extract text from PDF
export async function extractTextFromPDF(buffer: Buffer): Promise<{ text: string; numPages: number } | null> {
  try {
    const data = await pdfParse(buffer);
    return {
      text: data.text || '',
      numPages: data.numpages || 1,
    };
  } catch (error) {
    log.error('PDF extraction error', error);
    return null;
  }
}

// Format a value stored in millions USD to the most natural display unit
export function formatValueWithUnit(valueInMillions: number): string {
  const abs = Math.abs(valueInMillions);
  const sign = valueInMillions < 0 ? '-' : '';
  if (abs >= 1000) {
    const b = abs / 1000;
    return `${sign}$${b >= 10 ? b.toFixed(1) : b.toFixed(2)}B`;
  }
  if (abs >= 1) {
    return `${sign}$${abs >= 10 ? abs.toFixed(1) : abs.toFixed(2)}M`;
  }
  const k = abs * 1000;
  if (k >= 1) {
    return `${sign}$${k >= 10 ? k.toFixed(1) : k.toFixed(2)}K`;
  }
  const dollars = abs * 1000000;
  return `${sign}$${dollars.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

// Configure multer for memory storage
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/octet-stream',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/csv',
      'application/csv',
    ];

    const isEml = file.originalname?.toLowerCase().endsWith('.eml') || file.mimetype === 'message/rfc822';
    const isAllowedMime = allowedTypes.includes(file.mimetype);
    const isAllowedExt = /\.(pdf|xlsx|xls|docx|doc|txt|eml|csv)$/i.test(file.originalname || '');

    if (isAllowedMime || isAllowedExt || isEml) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype} (${file.originalname}). Allowed: PDF, Excel, Word, Text, Email (.eml)`));
    }
  },
});
