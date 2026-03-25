import crypto from 'crypto';
import { log } from '../utils/logger.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Get the encryption key from environment.
 * In production, throws if not configured. In dev, returns null (graceful degradation).
 */
function getKey(): Buffer | null {
  const key = process.env.DATA_ENCRYPTION_KEY;
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DATA_ENCRYPTION_KEY is required in production. Generate with: openssl rand -hex 32');
    }
    return null;
  }
  if (key.length !== 64) {
    log.warn('DATA_ENCRYPTION_KEY must be 64 hex characters (32 bytes). Encryption disabled.');
    return null;
  }
  return Buffer.from(key, 'hex');
}

/**
 * Encrypt a string using AES-256-GCM.
 * Returns the original text if no encryption key is configured (dev only).
 * Format: iv:authTag:ciphertext (all hex-encoded)
 */
export function encrypt(text: string): string {
  const key = getKey();
  if (!key) return text;

  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (err) {
    log.error('Encryption failed, storing plaintext', err);
    return text;
  }
}

/**
 * Decrypt an AES-256-GCM encrypted string.
 * Returns the original text if no encryption key is configured
 * or if the text doesn't look encrypted.
 */
export function decrypt(encryptedText: string): string {
  const key = getKey();
  if (!key) return encryptedText;

  // Not encrypted — return as-is
  const parts = encryptedText.split(':');
  if (parts.length !== 3) return encryptedText;

  try {
    const [ivHex, authTagHex, ciphertext] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    log.error('Decryption failed, returning raw text', err);
    return encryptedText;
  }
}

/**
 * Check if the encryption service is active (key is configured).
 */
export function isEncryptionEnabled(): boolean {
  return getKey() !== null;
}

/**
 * Encrypt a field value if it's non-null. For use on sensitive DB fields.
 */
export function encryptField(value: string | null): string | null {
  if (!value) return value;
  return encrypt(value);
}

/**
 * Decrypt a field value if it's non-null. For use on sensitive DB fields.
 */
export function decryptField(value: string | null): string | null {
  if (!value) return value;
  return decrypt(value);
}
