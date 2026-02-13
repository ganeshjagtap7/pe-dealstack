/**
 * Encryption Service Tests
 * Tests AES-256-GCM encrypt/decrypt for sensitive deal data at rest.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// ============================================================
// Encryption Service — Unit Tests
// ============================================================

// Valid 32-byte key (64 hex chars)
const TEST_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';

describe('Encryption service', () => {
  let originalKey: string | undefined;

  beforeEach(() => {
    originalKey = process.env.DATA_ENCRYPTION_KEY;
  });

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.DATA_ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.DATA_ENCRYPTION_KEY;
    }
  });

  async function getModule() {
    // Force re-import to pick up env changes
    const mod = await import('../src/services/encryption.js');
    return mod;
  }

  it('should export encrypt, decrypt, and isEncryptionEnabled', async () => {
    const mod = await getModule();
    expect(typeof mod.encrypt).toBe('function');
    expect(typeof mod.decrypt).toBe('function');
    expect(typeof mod.isEncryptionEnabled).toBe('function');
  });

  // --- Without encryption key (graceful degradation) ---

  it('should return plaintext when no key is set', async () => {
    delete process.env.DATA_ENCRYPTION_KEY;
    const { encrypt } = await getModule();
    const text = 'Revenue: $150M';
    expect(encrypt(text)).toBe(text);
  });

  it('should return plaintext on decrypt when no key is set', async () => {
    delete process.env.DATA_ENCRYPTION_KEY;
    const { decrypt } = await getModule();
    const text = 'some data';
    expect(decrypt(text)).toBe(text);
  });

  it('should report encryption disabled when no key', async () => {
    delete process.env.DATA_ENCRYPTION_KEY;
    const { isEncryptionEnabled } = await getModule();
    expect(isEncryptionEnabled()).toBe(false);
  });

  it('should report encryption disabled for invalid key length', async () => {
    process.env.DATA_ENCRYPTION_KEY = 'tooshort';
    const { isEncryptionEnabled } = await getModule();
    expect(isEncryptionEnabled()).toBe(false);
  });

  it('should return plaintext when key has wrong length', async () => {
    process.env.DATA_ENCRYPTION_KEY = 'abc123';
    const { encrypt } = await getModule();
    const text = 'sensitive data';
    expect(encrypt(text)).toBe(text);
  });

  // --- With encryption key ---

  it('should report encryption enabled with valid key', async () => {
    process.env.DATA_ENCRYPTION_KEY = TEST_KEY;
    const { isEncryptionEnabled } = await getModule();
    expect(isEncryptionEnabled()).toBe(true);
  });

  it('should encrypt text into iv:authTag:ciphertext format', async () => {
    process.env.DATA_ENCRYPTION_KEY = TEST_KEY;
    const { encrypt } = await getModule();
    const result = encrypt('Hello World');
    const parts = result.split(':');
    expect(parts).toHaveLength(3);
    // IV = 16 bytes = 32 hex chars
    expect(parts[0]).toHaveLength(32);
    // Auth tag = 16 bytes = 32 hex chars
    expect(parts[1]).toHaveLength(32);
    // Ciphertext is non-empty
    expect(parts[2].length).toBeGreaterThan(0);
  });

  it('should produce different ciphertext each time (random IV)', async () => {
    process.env.DATA_ENCRYPTION_KEY = TEST_KEY;
    const { encrypt } = await getModule();
    const text = 'same input';
    const enc1 = encrypt(text);
    const enc2 = encrypt(text);
    expect(enc1).not.toBe(enc2); // Different IVs → different output
  });

  it('should round-trip encrypt then decrypt', async () => {
    process.env.DATA_ENCRYPTION_KEY = TEST_KEY;
    const { encrypt, decrypt } = await getModule();
    const text = 'Revenue: $150M, EBITDA: $30M';
    const encrypted = encrypt(text);
    expect(encrypted).not.toBe(text);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(text);
  });

  it('should handle empty string', async () => {
    process.env.DATA_ENCRYPTION_KEY = TEST_KEY;
    const { encrypt, decrypt } = await getModule();
    const encrypted = encrypt('');
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe('');
  });

  it('should handle unicode text', async () => {
    process.env.DATA_ENCRYPTION_KEY = TEST_KEY;
    const { encrypt, decrypt } = await getModule();
    const text = 'Deal: Acme Corp — €50M revenue, 日本語テスト';
    const encrypted = encrypt(text);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(text);
  });

  it('should handle long text', async () => {
    process.env.DATA_ENCRYPTION_KEY = TEST_KEY;
    const { encrypt, decrypt } = await getModule();
    const text = 'A'.repeat(10000);
    const encrypted = encrypt(text);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(text);
  });

  it('should handle JSON stringified objects', async () => {
    process.env.DATA_ENCRYPTION_KEY = TEST_KEY;
    const { encrypt, decrypt } = await getModule();
    const obj = { revenue: 150, ebitda: 30, notes: 'Confidential PE data' };
    const text = JSON.stringify(obj);
    const encrypted = encrypt(text);
    const decrypted = decrypt(encrypted);
    expect(JSON.parse(decrypted)).toEqual(obj);
  });

  // --- Decrypt edge cases ---

  it('should return non-encrypted text as-is on decrypt', async () => {
    process.env.DATA_ENCRYPTION_KEY = TEST_KEY;
    const { decrypt } = await getModule();
    const plaintext = 'This is not encrypted';
    expect(decrypt(plaintext)).toBe(plaintext);
  });

  it('should return text with wrong format as-is on decrypt', async () => {
    process.env.DATA_ENCRYPTION_KEY = TEST_KEY;
    const { decrypt } = await getModule();
    // Only 2 parts instead of 3
    expect(decrypt('abc:def')).toBe('abc:def');
    // 4 parts
    expect(decrypt('a:b:c:d')).toBe('a:b:c:d');
  });

  it('should handle tampered ciphertext gracefully', async () => {
    process.env.DATA_ENCRYPTION_KEY = TEST_KEY;
    const { encrypt, decrypt } = await getModule();
    const encrypted = encrypt('secret data');
    // Tamper with the ciphertext portion
    const parts = encrypted.split(':');
    parts[2] = 'ff'.repeat(parts[2].length / 2);
    const tampered = parts.join(':');
    // Should not throw — returns raw text on failure
    const result = decrypt(tampered);
    expect(typeof result).toBe('string');
  });

  it('should not decrypt with wrong key', async () => {
    process.env.DATA_ENCRYPTION_KEY = TEST_KEY;
    const { encrypt } = await getModule();
    const encrypted = encrypt('secret');

    // Switch to a different key
    process.env.DATA_ENCRYPTION_KEY = 'b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3';
    const { decrypt } = await getModule();
    // Should not throw — returns raw on failure
    const result = decrypt(encrypted);
    expect(result).not.toBe('secret');
  });
});
