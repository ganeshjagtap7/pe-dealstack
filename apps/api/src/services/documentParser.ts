import mammoth from 'mammoth';
import { log } from '../utils/logger.js';

/**
 * Extract raw text from a Word document (.docx / .doc)
 */
export async function extractTextFromWord(buffer: Buffer): Promise<string | null> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    if (!result.value || result.value.trim().length < 50) {
      log.warn('Word document had insufficient text', { length: result.value?.length || 0 });
      return null;
    }
    return result.value;
  } catch (error) {
    log.error('Word extraction error', error);
    return null;
  }
}
