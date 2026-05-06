import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { extractTextFromExcel, isExcelFile } from '../excelFinancialExtractor.js';
import { openai, openaiDirect } from '../../openai.js';
import { log } from '../../utils/logger.js';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

export interface TextSection {
  name: string;
  text: string;
  hasTabularData: boolean;
}

export interface TextExtractionResult {
  text: string;
  sections: TextSection[];
  metadata: {
    format: 'pdf' | 'excel' | 'image' | 'docx';
    pageCount: number;
    fileSize: number;
    extractionMethod: string;
    isScanned: boolean;
  };
}

function detectTabularData(text: string): boolean {
  const lines = text.split('\n');
  let tabularLineCount = 0;
  for (const line of lines) {
    const digits = (line.match(/\d/g) || []).length;
    const hasMultipleDigitGroups = (line.match(/\d[\d,]+/g) || []).length >= 3;
    const hasWhitespace = /\s{2,}/.test(line);
    if (hasMultipleDigitGroups && hasWhitespace) tabularLineCount++;
  }
  return tabularLineCount >= 4;
}

async function extractDocx(filePath: string, fileSize: number): Promise<TextExtractionResult> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ path: filePath });
  const rawText = result.value || '';

  const paragraphs = rawText.split(/\n{2,}/);
  const sections: TextSection[] = [];
  let sectionIndex = 0;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    const name = `Paragraph ${++sectionIndex}`;
    sections.push({ name, text: trimmed, hasTabularData: detectTabularData(trimmed) });
  }

  return {
    text: rawText,
    sections,
    metadata: {
      format: 'docx',
      pageCount: 1,
      fileSize,
      extractionMethod: 'mammoth',
      isScanned: false,
    },
  };
}

function extractExcel(filePath: string, fileSize: number): TextExtractionResult {
  const buffer = fs.readFileSync(filePath);
  const rawText = extractTextFromExcel(buffer);
  if (!rawText) {
    return {
      text: '',
      sections: [],
      metadata: { format: 'excel', pageCount: 0, fileSize, extractionMethod: 'xlsx', isScanned: false },
    };
  }

  const sheetBlocks = rawText.split(/(?=\[Sheet:\s)/);
  const sections: TextSection[] = sheetBlocks
    .filter(b => b.trim().length > 0)
    .map(block => {
      const firstLine = block.split('\n')[0] || '';
      const nameMatch = firstLine.match(/\[Sheet:\s*([^\]]+)\]/);
      const name = nameMatch ? nameMatch[1].trim() : 'Sheet';
      return { name, text: block.trim(), hasTabularData: detectTabularData(block) };
    });

  return {
    text: rawText,
    sections,
    metadata: {
      format: 'excel',
      pageCount: sections.length,
      fileSize,
      extractionMethod: 'xlsx',
      isScanned: false,
    },
  };
}

async function extractImage(filePath: string, fileSize: number, mimeType: string): Promise<TextExtractionResult> {
  if (!openai) throw new Error('OpenAI not configured for image extraction');

  const imageBuffer = fs.readFileSync(filePath);
  const base64 = imageBuffer.toString('base64');
  const imageUrl = `data:${mimeType};base64,${base64}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Extract all text and financial data from this image. Preserve tables, numbers, currencies, and structure exactly as shown. Return the raw extracted text.',
          },
          { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
        ],
      },
    ],
    max_tokens: 4096,
  });

  const extractedText = response.choices[0]?.message?.content || '';

  return {
    text: extractedText,
    sections: [{ name: 'Image', text: extractedText, hasTabularData: detectTabularData(extractedText) }],
    metadata: {
      format: 'image',
      pageCount: 1,
      fileSize,
      extractionMethod: 'gpt4o-vision',
      isScanned: true,
    },
  };
}

async function extractPdf(filePath: string, fileSize: number): Promise<TextExtractionResult> {
  const buffer = fs.readFileSync(filePath);

  let parsed: { text: string; numpages: number } | null = null;
  let isPasswordProtected = false;

  try {
    parsed = await pdfParse(buffer);
  } catch (err: any) {
    const msg = String(err?.message || '').toLowerCase();
    if (msg.includes('password') || msg.includes('encrypted')) {
      throw new Error('Password-protected PDF');
    }
    log.warn('pdf-parse failed, will fall back to vision', { err: msg });
  }

  const rawText = parsed?.text?.replace(/\0/g, '') || '';
  const numPages = parsed?.numpages || 1;

  const words = rawText.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const alphaNumChars = (rawText.match(/[a-z0-9]/gi) || []).length;
  const totalChars = rawText.replace(/\s/g, '').length || 1;
  const alphaNumRatio = alphaNumChars / totalChars;

  const isScanned = wordCount < 50 || alphaNumRatio < 0.20;

  if (!isScanned && rawText.trim().length >= 50) {
    const pages = rawText.split(/\f/).filter(p => p.trim().length > 0);
    const sections: TextSection[] = pages.map((pageText, i) => ({
      name: `Page ${i + 1}`,
      text: pageText.trim(),
      hasTabularData: detectTabularData(pageText),
    }));

    return {
      text: rawText,
      sections: sections.length > 0 ? sections : [{ name: 'Page 1', text: rawText, hasTabularData: detectTabularData(rawText) }],
      metadata: { format: 'pdf', pageCount: numPages, fileSize, extractionMethod: 'pdf-parse', isScanned: false },
    };
  }

  log.info('Scanned PDF detected — falling back to GPT-4o Responses API', { wordCount, alphaNumRatio });

  const client = openaiDirect || openai;
  if (!client) throw new Error('OpenAI not configured for scanned PDF extraction');

  const base64 = buffer.toString('base64');

  const visionResponse = await (client as any).responses.create({
    model: 'gpt-4o',
    input: [
      {
        role: 'user',
        content: [
          {
            type: 'input_file',
            filename: 'document.pdf',
            file_data: `data:application/pdf;base64,${base64}`,
          },
          {
            type: 'input_text',
            text: 'Extract all text and financial data from this PDF. Preserve tables, numbers, currencies, and structure. Return the raw extracted text only.',
          },
        ],
      },
    ],
  });

  const visionText: string = visionResponse?.output_text || visionResponse?.output?.[0]?.content?.[0]?.text || '';

  return {
    text: visionText,
    sections: [{ name: 'Document', text: visionText, hasTabularData: detectTabularData(visionText) }],
    metadata: {
      format: 'pdf',
      pageCount: numPages,
      fileSize,
      extractionMethod: 'gpt4o-vision-pdf',
      isScanned: true,
    },
  };
}

export async function extractText(filePath: string, mimeType: string): Promise<TextExtractionResult> {
  const fileSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
  const fileName = path.basename(filePath);

  log.info('textExtractor: starting', { filePath, mimeType });

  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword' ||
      fileName.endsWith('.docx') || fileName.endsWith('.doc')) {
    return extractDocx(filePath, fileSize);
  }

  if (isExcelFile(mimeType, fileName)) {
    return extractExcel(filePath, fileSize);
  }

  if (mimeType.startsWith('image/')) {
    return extractImage(filePath, fileSize, mimeType);
  }

  if (mimeType === 'application/pdf' || fileName.endsWith('.pdf')) {
    return extractPdf(filePath, fileSize);
  }

  if (mimeType.startsWith('text/') || fileName.endsWith('.txt') || fileName.endsWith('.csv')) {
    const text = fs.readFileSync(filePath, 'utf-8');
    return {
      text,
      sections: [{ name: 'Document', text, hasTabularData: detectTabularData(text) }],
      metadata: { format: 'pdf', pageCount: 1, fileSize, extractionMethod: 'utf8', isScanned: false },
    };
  }

  throw Object.assign(new Error(`Unsupported file type: ${mimeType}`), { isUnsupportedFormat: true });
}
