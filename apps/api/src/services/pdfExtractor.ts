/**
 * pdfExtractor.ts — Shared PDF text extraction utility.
 * Used by documents-upload.ts (on upload) and documents.ts (re-analyze).
 */

import { createRequire } from 'module';
import { log } from '../utils/logger.js';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

export async function extractTextFromPDF(
  buffer: Buffer
): Promise<{ text: string; numPages: number } | null> {
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
