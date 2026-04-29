/**
 * textExtractor.ts — Multi-format text extraction.
 *
 * Wraps existing extractors (pdf-parse, excelFinancialExtractor, visionExtractor)
 * into a unified interface with section-based output, scanned-PDF detection,
 * and tabular density scoring. Does NOT duplicate any extraction logic.
 *
 * Extraction strategy (mirrors extractNode.ts):
 *   Excel → excelFinancialExtractor
 *   PDF   → pdf-parse  →  fallback GPT-4o Vision if sparse/scanned
 *   Image → GPT-4o Vision
 */

import fs from 'fs/promises';
import { createRequire } from 'module';
import { extractTextFromExcel, isExcelFile } from '../excelFinancialExtractor.js';
import { openai, isAIEnabled } from '../../openai.js';
import { log } from '../../utils/logger.js';
import mammoth from 'mammoth';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

// ─── Types ────────────────────────────────────────────────────

export interface TextSection {
  name: string;
  text: string;
  hasTabularData: boolean;
}

export interface TextExtractionMeta {
  format: 'pdf' | 'excel' | 'image' | 'docx';
  pageCount: number;
  fileSize: number;
  extractionMethod: 'pdf-parse' | 'excel-xlsx' | 'gpt-4o-vision' | 'gpt-4o-vision-ocr' | 'mammoth-docx';
  isScanned: boolean;
}

export interface TextExtractionResult {
  text: string;
  sections: TextSection[];
  metadata: TextExtractionMeta;
}

// ─── Constants ────────────────────────────────────────────────

/** Minimum chars for a PDF to be considered text-rich (mirrors extractNode MIN_TEXT_LENGTH) */
const MIN_TEXT_LENGTH = 200;

/** Minimum word count to consider PDF text valid (scanned PDF check) */
const MIN_WORD_COUNT = 50;

/** Minimum alphanumeric character ratio for non-scanned PDF text */
const MIN_ALPHA_RATIO = 0.2;

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Detect if a text block is likely tabular.
 * Counts lines with 3+ numeric tokens separated by whitespace/pipes/tabs.
 * Requires ≥4 such dense rows to classify as a table.
 */
function detectTabularData(text: string): boolean {
  const lines = text.split('\n');
  const denseLines = lines.filter(l => {
    const digitMatches = l.match(/\d/g)?.length ?? 0;
    return digitMatches > 3 && (l.includes(' ') || l.includes('\t') || l.includes('|'));
  });
  return denseLines.length >= 4;
}

/**
 * Detect whether a PDF's extracted text is from a scanned/image PDF.
 * Uses two independent heuristics (word count + alphanumeric ratio) for robustness.
 */
function isScannedPdf(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;

  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount < MIN_WORD_COUNT) return true;

  const alphaNumCount = (text.match(/[a-zA-Z0-9]/g) ?? []).length;
  const ratio = alphaNumCount / text.length;
  return ratio < MIN_ALPHA_RATIO;
}

/**
 * Split extracted PDF text into per-page sections.
 * pdf-parse emits form-feed (\f) between pages; many PDFs instead use
 * 4+ consecutive newlines as page breaks.
 */
function splitPdfIntoSections(text: string, reportedPages: number): TextSection[] {
  const rawPages = text.split(/\f|\n{4,}/).filter(p => p.trim().length > 0);
  const pageCount = Math.max(rawPages.length, reportedPages);

  return rawPages.map((pageText, idx) => ({
    name: `Page ${idx + 1}`,
    text: pageText,
    hasTabularData: detectTabularData(pageText),
  })).slice(0, pageCount); // never emit more sections than pages
}

/**
 * Build a vision-based TextExtractionResult from a file path.
 * Called both for images and as PDF fallback when text is too sparse.
 */
async function extractViaVision(
  filePath: string,
  fileSize: number,
): Promise<TextExtractionResult> {
  if (!isAIEnabled() || !openai) {
    throw new Error('OpenAI not configured — cannot run Vision extraction');
  }

  const buffer = await fs.readFile(filePath);
  const fileName = filePath.split(/[/\\]/).pop() ?? 'document';

  log.info('textExtractor: running GPT-4o Vision OCR', { fileName, fileSize });

  const base64 = buffer.toString('base64');
  const mime = fileName.toLowerCase().endsWith('.png')
    ? 'image/png'
    : fileName.toLowerCase().endsWith('.webp')
      ? 'image/webp'
      : 'image/jpeg';

  const dataUrl = `data:${mime};base64,${base64}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content:
          'Extract ALL visible text and tables from the image. ' +
          'Preserve table structure where possible using markdown tables. ' +
          'Do not summarize. Do not invent values. Output plain text/markdown only.',
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Please extract all text and tables exactly as shown.' },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      },
    ],
    temperature: 0,
    max_tokens: 4000,
  }, { timeout: 60000 });

  const text = response.choices?.[0]?.message?.content ?? '';
  if (!text || text.trim().length < 20) {
    throw new Error('Vision OCR returned empty text');
  }

  return {
    text,
    sections: [{
      name: 'Vision Extraction',
      text,
      hasTabularData: detectTabularData(text),
    }],
    metadata: {
      format: 'image',
      pageCount: 1,
      fileSize,
      extractionMethod: 'gpt-4o-vision-ocr',
      isScanned: true,
    },
  };
}

async function extractPdfViaVisionText(
  filePath: string,
  fileSize: number,
): Promise<TextExtractionResult> {
  if (!isAIEnabled() || !openai) {
    throw new Error('OpenAI not configured — cannot run Vision extraction');
  }

  const buffer = await fs.readFile(filePath);
  const fileName = filePath.split(/[/\\]/).pop() ?? 'document.pdf';
  const base64 = buffer.toString('base64');
  const fileDataUrl = `data:application/pdf;base64,${base64}`;

  log.info('textExtractor: running GPT-4o PDF vision text extraction', { fileName, fileSize });

  // Use Responses API for native PDF input (same approach as visionExtractor.ts)
  const response = await (openai as any).responses.create({
    model: 'gpt-4o',
    instructions:
      'Extract ALL visible text and tables from the PDF. ' +
      'Preserve table structure where possible using markdown tables. ' +
      'Do not summarize. Do not invent values. Output plain text/markdown only.',
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_file', filename: fileName, file_data: fileDataUrl },
          { type: 'input_text', text: 'Please extract all text and tables exactly as shown.' },
        ],
      },
    ],
  });

  const text: string = response.output_text ?? '';
  if (!text || text.trim().length < 20) {
    throw new Error('Vision PDF extraction returned empty text');
  }

  const sections: TextSection[] = [{
    name: 'Vision PDF Extraction',
    text,
    hasTabularData: detectTabularData(text),
  }];

  return {
    text,
    sections,
    metadata: {
      format: 'pdf',
      pageCount: 1,
      fileSize,
      extractionMethod: 'gpt-4o-vision',
      isScanned: true,
    },
  };
}

async function extractDocx(
  filePath: string,
  fileSize: number,
): Promise<TextExtractionResult> {
  const buffer = await fs.readFile(filePath);
  const fileName = filePath.split(/[/\\]/).pop() ?? 'document.docx';

  log.info('textExtractor: extracting DOCX using mammoth', { fileName, fileSize });

  const result = await mammoth.extractRawText({ buffer });
  const text = result.value;

  if (!text || text.trim().length < 50) {
    throw new Error('DOCX file appears empty or has no readable text');
  }

  // Split by paragraphs for sections
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
  const sections: TextSection[] = paragraphs.map((para, idx) => ({
    name: `Section ${idx + 1}`,
    text: para,
    hasTabularData: detectTabularData(para),
  }));

  return {
    text,
    sections,
    metadata: {
      format: 'docx',
      pageCount: sections.length,
      fileSize,
      extractionMethod: 'mammoth-docx',
      isScanned: false,
    },
  };
}

// ─── Main Export ─────────────────────────────────────────────

/**
 * Extract text from a local file, returning sections + metadata.
 *
 * @param filePath  Absolute path to the uploaded file
 * @param mimeType  MIME type (used for format detection)
 */
export async function extractText(
  filePath: string,
  mimeType: string,
): Promise<TextExtractionResult> {
  const fileBuffer = await fs.readFile(filePath);
  const fileSize = fileBuffer.length;
  const fileName = filePath.split(/[/\\]/).pop() ?? '';

  // ── DOCX ────────────────────────────────────────────────────
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword' ||
    fileName.toLowerCase().endsWith('.docx') ||
    fileName.toLowerCase().endsWith('.doc')
  ) {
    return extractDocx(filePath, fileSize);
  }

  // ── Excel ───────────────────────────────────────────────────
  if (isExcelFile(mimeType, fileName)) {
    log.info('textExtractor: Excel path', { fileName, fileSize });

    const text = extractTextFromExcel(fileBuffer);

    if (!text || text.trim().length < 50) {
      throw new Error('Excel file appears empty or has no readable financial data');
    }

    // Each scored sheet block becomes its own section
    const sections: TextSection[] = text
      .split(/\n{2,}(?=\[Sheet:)/)
      .filter(block => block.trim().length > 0)
      .map(block => {
        const firstLine = block.split('\n')[0] ?? '';
        const sheetName = firstLine.match(/\[Sheet:\s*([^\]]+)\]/)?.[1] ?? 'Sheet';
        return {
          name: sheetName,
          text: block,
          hasTabularData: detectTabularData(block),
        };
      });

    return {
      text,
      sections,
      metadata: {
        format: 'excel',
        pageCount: sections.length,
        fileSize,
        extractionMethod: 'excel-xlsx',
        isScanned: false,
      },
    };
  }

  // ── Image ───────────────────────────────────────────────────
  if (mimeType.startsWith('image/')) {
    return extractViaVision(filePath, fileSize);
  }

  // ── PDF ─────────────────────────────────────────────────────
  if (mimeType === 'application/pdf' || fileName.endsWith('.pdf')) {
    log.info('textExtractor: PDF path — trying pdf-parse', { fileName, fileSize });

    try {
      const pdfData = await pdfParse(fileBuffer);
      const text: string = pdfData.text ?? '';

      // Scanned PDF? Fall through to Vision.
      if (text.trim().length < MIN_TEXT_LENGTH || isScannedPdf(text)) {
        log.info('textExtractor: sparse/scanned PDF — switching to Vision', {
          textLength: text.trim().length,
        });
        return extractPdfViaVisionText(filePath, fileSize);
      }

      const sections = splitPdfIntoSections(text, pdfData.numpages ?? 1);

      return {
        text,
        sections,
        metadata: {
          format: 'pdf',
          pageCount: pdfData.numpages ?? sections.length,
          fileSize,
          extractionMethod: 'pdf-parse',
          isScanned: false,
        },
      };
    } catch (err: any) {
      if (err.message?.includes('Password')) {
        throw new Error('Password-protected PDF is not supported');
      }
      // pdf-parse failure → Vision fallback
      log.warn('textExtractor: pdf-parse failed, trying Vision', { error: err.message });
      return extractPdfViaVisionText(filePath, fileSize);
    }
  }

  throw new Error(`Unsupported file format: ${mimeType}`);
}
