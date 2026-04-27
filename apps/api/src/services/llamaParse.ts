/**
 * llamaParse.ts — LlamaParse PDF preprocessing.
 * Extracts clean structured markdown from PDFs, preserving table layouts.
 * Used as Layer 1 before GPT-4o classification for better accuracy.
 */

import { log } from '../utils/logger.js';

const apiKey = process.env.LLAMA_CLOUD_API_KEY;

if (!apiKey) {
  log.warn('LLAMA_CLOUD_API_KEY not set — LlamaParse disabled, falling back to pdf-parse');
}

export const isLlamaParseEnabled = () => !!apiKey;

/**
 * Parse a PDF buffer using LlamaParse API.
 * Returns clean markdown text with tables preserved.
 */
export async function parseWithLlama(
  fileBuffer: Buffer,
  fileName: string,
): Promise<{ text: string; pages: number } | null> {
  if (!apiKey) return null;

  try {
    log.info('LlamaParse: starting PDF parse', { fileName, sizeKB: Math.round(fileBuffer.length / 1024) });

    // LlamaParse API endpoint
    const formData = new FormData();
    formData.append('file', new Blob([fileBuffer]), fileName);

    // Upload file
    const uploadRes = await fetch('https://api.cloud.llamaindex.ai/api/parsing/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'accept': 'application/json',
      },
      body: formData,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      log.error('LlamaParse: upload failed', { status: uploadRes.status, error: errText });
      return null;
    }

    const uploadData = await uploadRes.json() as { id: string };
    const jobId = uploadData.id;

    log.info('LlamaParse: job created', { jobId });

    // Poll for completion (max 60 seconds)
    let result: any = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const statusRes = await fetch(`https://api.cloud.llamaindex.ai/api/parsing/job/${jobId}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'accept': 'application/json',
        },
      });

      if (!statusRes.ok) continue;

      const statusData = await statusRes.json() as { status: string; result?: any };
      if (statusData.status === 'SUCCESS') {
        result = statusData;
        break;
      } else if (statusData.status === 'ERROR') {
        log.error('LlamaParse: job failed', { jobId });
        return null;
      }
      // Still PENDING — continue polling
    }

    if (!result) {
      log.warn('LlamaParse: timeout after 60s', { jobId });
      return null;
    }

    // Get markdown result
    const markdownRes = await fetch(`https://api.cloud.llamaindex.ai/api/parsing/job/${jobId}/result/markdown`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'accept': 'application/json',
      },
    });

    if (!markdownRes.ok) {
      log.error('LlamaParse: failed to get markdown', { status: markdownRes.status });
      return null;
    }

    const markdownData = await markdownRes.json() as { markdown: string; pages?: number };
    const text = markdownData.markdown || '';
    const pages = markdownData.pages || 0;

    log.info('LlamaParse: extraction complete', { chars: text.length, pages });

    return { text, pages };
  } catch (err) {
    log.error('LlamaParse: unexpected error', err);
    return null;
  }
}
