/**
 * File Validation Service
 * Provides secure file upload validation with magic bytes verification
 */

// Magic bytes signatures for allowed file types
const FILE_SIGNATURES: Record<string, { bytes: number[]; offset?: number }[]> = {
  'application/pdf': [
    { bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  ],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
    { bytes: [0x50, 0x4B, 0x03, 0x04] }, // PK (ZIP-based XLSX)
    { bytes: [0x50, 0x4B, 0x05, 0x06] }, // PK (empty XLSX)
    { bytes: [0x50, 0x4B, 0x07, 0x08] }, // PK (spanned XLSX)
  ],
  'application/vnd.ms-excel': [
    { bytes: [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1] }, // OLE compound file (XLS)
  ],
  'text/csv': [
    // CSV has no specific magic bytes, validated by content
  ],
  'application/msword': [
    { bytes: [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1] }, // OLE compound file (DOC)
  ],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    { bytes: [0x50, 0x4B, 0x03, 0x04] }, // PK (ZIP-based DOCX)
    { bytes: [0x50, 0x4B, 0x05, 0x06] }, // PK (empty DOCX)
    { bytes: [0x50, 0x4B, 0x07, 0x08] }, // PK (spanned DOCX)
  ],
  'application/vnd.ms-outlook': [
    { bytes: [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1] }, // OLE compound file (MSG)
  ],
  'message/rfc822': [
    // Email files have text headers, validated by content
  ],
  'image/jpeg': [
    { bytes: [0xFF, 0xD8, 0xFF] },
  ],
  'image/png': [
    { bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
  ],
};

// File size limits per type (in bytes)
export const FILE_SIZE_LIMITS: Record<string, number> = {
  'application/pdf': 100 * 1024 * 1024,          // 100MB for PDFs (CIMs can be large)
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 50 * 1024 * 1024, // 50MB for Excel
  'application/vnd.ms-excel': 50 * 1024 * 1024,  // 50MB for old Excel
  'text/csv': 20 * 1024 * 1024,                  // 20MB for CSV
  'application/msword': 25 * 1024 * 1024,        // 25MB for DOC
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 25 * 1024 * 1024, // 25MB for DOCX
  'application/vnd.ms-outlook': 25 * 1024 * 1024, // 25MB for MSG
  'message/rfc822': 10 * 1024 * 1024,            // 10MB for EML
  'image/jpeg': 10 * 1024 * 1024,                // 10MB for images
  'image/png': 10 * 1024 * 1024,
  'default': 50 * 1024 * 1024,                   // 50MB default
};

// Allowed MIME types
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-outlook',
  'message/rfc822',
  'image/jpeg',
  'image/png',
];

// Dangerous patterns in filenames
const DANGEROUS_FILENAME_PATTERNS = [
  /\.\./,                    // Path traversal
  /^\.+$/,                   // Only dots
  /[<>:"|?*\x00-\x1F]/,      // Invalid/control characters
  /\.(exe|bat|cmd|sh|ps1|vbs|js|jar|php|py|rb|pl)$/i, // Executable extensions
  /^\s+|\s+$/,               // Leading/trailing whitespace
];

// Maximum filename length
const MAX_FILENAME_LENGTH = 255;

export interface FileValidationResult {
  isValid: boolean;
  error?: string;
  sanitizedFilename?: string;
  detectedMimeType?: string;
}

/**
 * Validate file magic bytes match the claimed MIME type
 */
function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const signatures = FILE_SIGNATURES[mimeType];

  // If no signatures defined, allow (for text-based formats)
  if (!signatures || signatures.length === 0) {
    return true;
  }

  // Check if any signature matches
  return signatures.some(sig => {
    const offset = sig.offset || 0;
    if (buffer.length < offset + sig.bytes.length) {
      return false;
    }
    return sig.bytes.every((byte, i) => buffer[offset + i] === byte);
  });
}

/**
 * Detect MIME type from buffer magic bytes
 */
function detectMimeType(buffer: Buffer): string | null {
  for (const [mimeType, signatures] of Object.entries(FILE_SIGNATURES)) {
    if (signatures.length === 0) continue;

    const matches = signatures.some(sig => {
      const offset = sig.offset || 0;
      if (buffer.length < offset + sig.bytes.length) {
        return false;
      }
      return sig.bytes.every((byte, i) => buffer[offset + i] === byte);
    });

    if (matches) {
      return mimeType;
    }
  }
  return null;
}

/**
 * Sanitize filename to prevent security issues
 */
export function sanitizeFilename(filename: string): string {
  let sanitized = filename;

  // Remove path separators
  sanitized = sanitized.replace(/[\/\\]/g, '_');

  // Remove control characters
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');

  // Replace dangerous characters
  sanitized = sanitized.replace(/[<>:"|?*]/g, '_');

  // Remove leading/trailing spaces and dots
  sanitized = sanitized.trim().replace(/^\.+|\.+$/g, '');

  // Limit length
  if (sanitized.length > MAX_FILENAME_LENGTH) {
    const ext = sanitized.match(/\.[^.]+$/)?.[0] || '';
    const name = sanitized.slice(0, MAX_FILENAME_LENGTH - ext.length);
    sanitized = name + ext;
  }

  // If empty after sanitization, use default
  if (!sanitized || sanitized === '') {
    sanitized = 'file_' + Date.now();
  }

  return sanitized;
}

/**
 * Check if filename contains dangerous patterns
 */
function hasDangerousFilename(filename: string): boolean {
  return DANGEROUS_FILENAME_PATTERNS.some(pattern => pattern.test(filename));
}

/**
 * Validate a file upload
 */
export function validateFile(
  buffer: Buffer,
  originalFilename: string,
  claimedMimeType: string
): FileValidationResult {
  // 1. Check if MIME type is allowed
  if (!ALLOWED_MIME_TYPES.includes(claimedMimeType)) {
    return {
      isValid: false,
      error: `File type '${claimedMimeType}' is not allowed. Allowed types: PDF, Excel, CSV, Word, Email, Images`,
    };
  }

  // 2. Check filename for dangerous patterns
  if (hasDangerousFilename(originalFilename)) {
    return {
      isValid: false,
      error: 'Filename contains invalid characters or patterns',
    };
  }

  // 3. Validate file size
  const sizeLimit = FILE_SIZE_LIMITS[claimedMimeType] || FILE_SIZE_LIMITS.default;
  if (buffer.length > sizeLimit) {
    const limitMB = Math.round(sizeLimit / (1024 * 1024));
    return {
      isValid: false,
      error: `File size exceeds limit of ${limitMB}MB for this file type`,
    };
  }

  // 4. Validate magic bytes
  if (!validateMagicBytes(buffer, claimedMimeType)) {
    const detected = detectMimeType(buffer);
    return {
      isValid: false,
      error: `File content does not match claimed type. Detected: ${detected || 'unknown'}`,
      detectedMimeType: detected || undefined,
    };
  }

  // 5. Sanitize filename
  const sanitizedFilename = sanitizeFilename(originalFilename);

  // 6. Additional content checks for text-based formats
  if (claimedMimeType === 'text/csv') {
    // Basic CSV validation - should be mostly printable characters
    const text = buffer.toString('utf8', 0, Math.min(1000, buffer.length));
    const printableRatio = text.replace(/[^\x20-\x7E\r\n\t,;]/g, '').length / text.length;
    if (printableRatio < 0.8) {
      return {
        isValid: false,
        error: 'CSV file appears to contain invalid or binary content',
      };
    }
  }

  return {
    isValid: true,
    sanitizedFilename,
    detectedMimeType: claimedMimeType,
  };
}

/**
 * Validate file by extension (fallback when MIME type is unreliable)
 */
export function getExpectedMimeType(filename: string): string | null {
  const ext = filename.toLowerCase().match(/\.([^.]+)$/)?.[1];

  const extensionToMime: Record<string, string> = {
    'pdf': 'application/pdf',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'xls': 'application/vnd.ms-excel',
    'csv': 'text/csv',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'msg': 'application/vnd.ms-outlook',
    'eml': 'message/rfc822',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
  };

  return extensionToMime[ext || ''] || null;
}

/**
 * Check if file could potentially be executable or script
 */
export function isPotentiallyDangerous(buffer: Buffer, filename: string): boolean {
  // Check for executable signatures
  const executableSignatures = [
    [0x4D, 0x5A], // MZ (Windows executable)
    [0x7F, 0x45, 0x4C, 0x46], // ELF (Linux executable)
    [0xCA, 0xFE, 0xBA, 0xBE], // Mach-O (Mac executable)
    [0x23, 0x21], // Shebang (#!)
  ];

  for (const sig of executableSignatures) {
    if (buffer.length >= sig.length) {
      const matches = sig.every((byte, i) => buffer[i] === byte);
      if (matches) return true;
    }
  }

  // Check for script content at start
  const start = buffer.toString('utf8', 0, Math.min(100, buffer.length)).toLowerCase();
  const dangerousPatterns = [
    '<script',
    '<?php',
    '#!/',
    'import os',
    'require(',
    'eval(',
  ];

  for (const pattern of dangerousPatterns) {
    if (start.includes(pattern)) return true;
  }

  return false;
}

export default {
  validateFile,
  sanitizeFilename,
  getExpectedMimeType,
  isPotentiallyDangerous,
  ALLOWED_MIME_TYPES,
  FILE_SIZE_LIMITS,
};
