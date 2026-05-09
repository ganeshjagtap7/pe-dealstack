/**
 * pdfTextVision.ts — OCR fallback for scanned / image-only PDFs.
 *
 * When pdf-parse + LlamaParse both return < MIN_USEFUL_TEXT chars, we treat
 * the PDF as image-only (scanned CIM, NDA scan, etc.) and fall back to
 * GPT-4.1 via the Responses API, which natively supports PDF file inputs.
 *
 * Returns plain text (no structure). Used by extractTextFromPDF in
 * ingest-shared.ts and the Criteria Engine /ai/extract-document route. The
 * existing visionExtractor.ts is for financial-statement classification —
 * different output shape, same plumbing.
 */

import { openaiDirect, trackedDirectResponsesCreate } from '../openai.js';
import { log } from '../utils/logger.js';

const SYSTEM_PROMPT = `You are a high-fidelity OCR engine. The user has uploaded a PDF that may be scanned, image-only, or text-light.

Your job: extract every word of readable text from the document, preserving section order. Return plain text only — no commentary, no JSON, no markdown headers, no "Here is the extracted text:" preamble.

Rules:
- Preserve paragraph breaks. Use a blank line between paragraphs.
- Preserve table contents as best you can — tab-separated columns, one row per line.
- For figures (charts, logos, diagrams), do not invent text. Skip them silently.
- For boilerplate headers / footers / page numbers that repeat, include them once.
- If the PDF is genuinely empty or unreadable, return the literal string "NO_TEXT_FOUND".`;

/**
 * Extract plain text from a PDF buffer using GPT-4.1's native PDF support.
 * Returns null on hard failure (no key, API error, empty response).
 *
 * Returns the literal string "NO_TEXT_FOUND" if the model couldn't read
 * anything — caller should treat that as null.
 */
export async function extractTextFromPDFVision(
  pdfBuffer: Buffer,
  fileName = 'document.pdf',
): Promise<string | null> {
  if (!openaiDirect) {
    log.warn('PDF Vision OCR: OPENAI_API_KEY not configured (Responses API needs direct key, OpenRouter does not proxy /v1/responses), skipping');
    return null;
  }
  if (!pdfBuffer || pdfBuffer.length === 0) return null;

  log.info('PDF Vision OCR: starting extraction', {
    fileName,
    sizeKB: Math.round(pdfBuffer.length / 1024),
  });

  try {
    const base64 = pdfBuffer.toString('base64');
    const fileDataUrl = `data:application/pdf;base64,${base64}`;

    const response = await trackedDirectResponsesCreate('pdf_text_ocr', {
      model: 'gpt-4.1',
      instructions: SYSTEM_PROMPT,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_file',
              filename: fileName,
              file_data: fileDataUrl,
            },
            {
              type: 'input_text',
              text: 'Extract every word of readable text from this PDF. Plain text only.',
            },
          ],
        },
      ],
    });

    const text: string | null = response.output_text ?? null;
    if (!text || text.trim().length === 0) {
      log.warn('PDF Vision OCR: empty response');
      return null;
    }
    if (text.trim() === 'NO_TEXT_FOUND') {
      log.info('PDF Vision OCR: model returned NO_TEXT_FOUND', { fileName });
      return null;
    }

    log.info('PDF Vision OCR: completed', {
      fileName,
      chars: text.length,
    });
    return text;
  } catch (err: any) {
    if (err?.status === 404 || err?.message?.includes('responses')) {
      log.error('PDF Vision OCR: Responses API not available on this OpenAI key', err.message);
    } else {
      log.error('PDF Vision OCR: unexpected error', err);
    }
    return null;
  }
}
