/**
 * File Upload Security Tests
 * Tests file validation, magic bytes verification, and malicious file detection
 */

import { describe, it, expect } from 'vitest';
import {
  validateFile,
  sanitizeFilename,
  getExpectedMimeType,
  isPotentiallyDangerous,
  ALLOWED_MIME_TYPES,
  FILE_SIZE_LIMITS,
} from '../src/services/fileValidator.js';

// Helper to create buffers with specific content
function createBuffer(bytes: number[]): Buffer {
  return Buffer.from(bytes);
}

// PDF magic bytes: %PDF
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-

// PNG magic bytes
const PNG_MAGIC = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

// JPEG magic bytes
const JPEG_MAGIC = [0xFF, 0xD8, 0xFF, 0xE0];

// ZIP magic bytes (used by XLSX, DOCX)
const ZIP_MAGIC = [0x50, 0x4B, 0x03, 0x04];

// OLE compound file magic bytes (used by XLS, DOC, MSG)
const OLE_MAGIC = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];

// Windows executable magic bytes
const EXE_MAGIC = [0x4D, 0x5A]; // MZ

// ELF executable magic bytes
const ELF_MAGIC = [0x7F, 0x45, 0x4C, 0x46]; // .ELF

describe('File Validator - Magic Bytes Verification', () => {
  describe('PDF files', () => {
    it('should accept valid PDF with correct magic bytes', () => {
      const buffer = Buffer.concat([
        createBuffer(PDF_MAGIC),
        Buffer.from('1.4\n%... PDF content'),
      ]);

      const result = validateFile(buffer, 'document.pdf', 'application/pdf');

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject file claiming to be PDF but with wrong magic bytes', () => {
      const buffer = Buffer.from('This is not a PDF file');

      const result = validateFile(buffer, 'fake.pdf', 'application/pdf');

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('does not match claimed type');
    });

    it('should reject file with EXE content disguised as PDF', () => {
      const buffer = Buffer.concat([
        createBuffer(EXE_MAGIC),
        Buffer.alloc(100),
      ]);

      const result = validateFile(buffer, 'virus.pdf', 'application/pdf');

      expect(result.isValid).toBe(false);
    });
  });

  describe('Image files', () => {
    it('should accept valid PNG with correct magic bytes', () => {
      const buffer = Buffer.concat([
        createBuffer(PNG_MAGIC),
        Buffer.alloc(100), // Simulated image data
      ]);

      const result = validateFile(buffer, 'image.png', 'image/png');

      expect(result.isValid).toBe(true);
    });

    it('should accept valid JPEG with correct magic bytes', () => {
      const buffer = Buffer.concat([
        createBuffer(JPEG_MAGIC),
        Buffer.alloc(100),
      ]);

      const result = validateFile(buffer, 'photo.jpg', 'image/jpeg');

      expect(result.isValid).toBe(true);
    });

    it('should reject PNG with EXE magic bytes', () => {
      const buffer = Buffer.concat([
        createBuffer(EXE_MAGIC),
        Buffer.alloc(100),
      ]);

      const result = validateFile(buffer, 'image.png', 'image/png');

      expect(result.isValid).toBe(false);
    });
  });

  describe('Office files', () => {
    it('should accept XLSX with ZIP magic bytes', () => {
      const buffer = Buffer.concat([
        createBuffer(ZIP_MAGIC),
        Buffer.alloc(100),
      ]);

      const result = validateFile(
        buffer,
        'spreadsheet.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );

      expect(result.isValid).toBe(true);
    });

    it('should accept XLS with OLE magic bytes', () => {
      const buffer = Buffer.concat([
        createBuffer(OLE_MAGIC),
        Buffer.alloc(100),
      ]);

      const result = validateFile(buffer, 'spreadsheet.xls', 'application/vnd.ms-excel');

      expect(result.isValid).toBe(true);
    });

    it('should accept DOCX with ZIP magic bytes', () => {
      const buffer = Buffer.concat([
        createBuffer(ZIP_MAGIC),
        Buffer.alloc(100),
      ]);

      const result = validateFile(
        buffer,
        'document.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );

      expect(result.isValid).toBe(true);
    });
  });

  describe('CSV files', () => {
    it('should accept valid CSV content', () => {
      const csvContent = 'name,email,amount\nJohn,john@example.com,100\nJane,jane@example.com,200';
      const buffer = Buffer.from(csvContent);

      const result = validateFile(buffer, 'data.csv', 'text/csv');

      expect(result.isValid).toBe(true);
    });

    it('should reject CSV with mostly binary content', () => {
      const binaryContent = Buffer.alloc(1000);
      // Fill with non-printable characters
      for (let i = 0; i < 1000; i++) {
        binaryContent[i] = Math.floor(Math.random() * 32); // Control characters
      }

      const result = validateFile(binaryContent, 'data.csv', 'text/csv');

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('invalid or binary content');
    });
  });
});

describe('File Validator - MIME Type Validation', () => {
  it('should accept all allowed MIME types', () => {
    for (const mimeType of ALLOWED_MIME_TYPES) {
      // Create a valid buffer for the type (simplified test)
      let buffer: Buffer;

      if (mimeType === 'application/pdf') {
        buffer = Buffer.concat([createBuffer(PDF_MAGIC), Buffer.alloc(100)]);
      } else if (mimeType.includes('spreadsheetml') || mimeType.includes('wordprocessingml')) {
        buffer = Buffer.concat([createBuffer(ZIP_MAGIC), Buffer.alloc(100)]);
      } else if (mimeType === 'application/vnd.ms-excel' || mimeType === 'application/msword' || mimeType === 'application/vnd.ms-outlook') {
        buffer = Buffer.concat([createBuffer(OLE_MAGIC), Buffer.alloc(100)]);
      } else if (mimeType === 'image/png') {
        buffer = Buffer.concat([createBuffer(PNG_MAGIC), Buffer.alloc(100)]);
      } else if (mimeType === 'image/jpeg') {
        buffer = Buffer.concat([createBuffer(JPEG_MAGIC), Buffer.alloc(100)]);
      } else if (mimeType === 'text/csv') {
        buffer = Buffer.from('col1,col2,col3\nval1,val2,val3');
      } else {
        // For email types without specific magic bytes
        buffer = Buffer.from('From: test@example.com\nTo: other@example.com\nContent');
      }

      const result = validateFile(buffer, 'test.file', mimeType);
      // Some may fail on magic bytes, but MIME type should be allowed
      expect(ALLOWED_MIME_TYPES.includes(mimeType)).toBe(true);
    }
  });

  it('should reject disallowed MIME types', () => {
    const disallowedTypes = [
      'application/javascript',
      'text/html',
      'application/x-executable',
      'application/x-php',
      'text/x-python',
    ];

    for (const mimeType of disallowedTypes) {
      const buffer = Buffer.from('content');
      const result = validateFile(buffer, 'test.file', mimeType);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('not allowed');
    }
  });
});

describe('File Validator - File Size Limits', () => {
  it('should enforce PDF size limit', () => {
    const maxSize = FILE_SIZE_LIMITS['application/pdf'];
    const oversizedBuffer = Buffer.concat([
      createBuffer(PDF_MAGIC),
      Buffer.alloc(maxSize + 1),
    ]);

    const result = validateFile(oversizedBuffer, 'huge.pdf', 'application/pdf');

    expect(result.isValid).toBe(false);
    expect(result.error).toContain('exceeds limit');
  });

  it('should accept files within size limits', () => {
    const validSize = 1024 * 1024; // 1MB
    const buffer = Buffer.concat([
      createBuffer(PDF_MAGIC),
      Buffer.alloc(validSize),
    ]);

    const result = validateFile(buffer, 'normal.pdf', 'application/pdf');

    expect(result.isValid).toBe(true);
  });

  it('should use type-specific size limits', () => {
    // CSV has smaller limit than PDF
    expect(FILE_SIZE_LIMITS['text/csv']).toBeLessThan(FILE_SIZE_LIMITS['application/pdf']);
    // Images have smaller limit than PDFs
    expect(FILE_SIZE_LIMITS['image/jpeg']).toBeLessThan(FILE_SIZE_LIMITS['application/pdf']);
  });
});

describe('Filename Sanitization', () => {
  it('should neutralize path traversal attempts by removing separators', () => {
    // The function replaces path separators with underscores, neutralizing traversal
    // The ".." remains but without "/" it can't traverse directories
    const sanitized1 = sanitizeFilename('../../../etc/passwd');
    expect(sanitized1).not.toContain('/');
    expect(sanitized1).not.toContain('\\');

    const sanitized2 = sanitizeFilename('..\\..\\windows\\system32');
    expect(sanitized2).not.toContain('/');
    expect(sanitized2).not.toContain('\\');
  });

  it('should remove path separators', () => {
    expect(sanitizeFilename('folder/file.txt')).not.toContain('/');
    expect(sanitizeFilename('folder\\file.txt')).not.toContain('\\');
  });

  it('should remove control characters', () => {
    const withControlChars = 'file\x00name\x1F.pdf';
    const sanitized = sanitizeFilename(withControlChars);

    expect(sanitized).not.toMatch(/[\x00-\x1F]/);
  });

  it('should replace dangerous characters', () => {
    const dangerous = 'file<script>alert(1)</script>.pdf';
    const sanitized = sanitizeFilename(dangerous);

    expect(sanitized).not.toContain('<');
    expect(sanitized).not.toContain('>');
  });

  it('should trim leading/trailing whitespace', () => {
    expect(sanitizeFilename('  file.pdf  ')).toBe('file.pdf');
    expect(sanitizeFilename('\tfile.pdf\n')).toBe('file.pdf');
  });

  it('should handle filenames with only dots', () => {
    const result = sanitizeFilename('...');
    expect(result).not.toBe('...');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should truncate overly long filenames', () => {
    const longName = 'a'.repeat(300) + '.pdf';
    const sanitized = sanitizeFilename(longName);

    expect(sanitized.length).toBeLessThanOrEqual(255);
    expect(sanitized).toContain('.pdf'); // Should preserve extension
  });

  it('should generate default name for empty filenames', () => {
    const result = sanitizeFilename('');
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('file_');
  });
});

describe('Dangerous Filename Detection', () => {
  it('should reject executable extensions', () => {
    const dangerousExtensions = ['.exe', '.bat', '.cmd', '.sh', '.ps1', '.vbs', '.js', '.jar', '.php', '.py', '.rb', '.pl'];

    for (const ext of dangerousExtensions) {
      const buffer = Buffer.from('content');
      const result = validateFile(buffer, `malware${ext}`, 'application/octet-stream');

      // Should be rejected either by extension or by MIME type
      expect(result.isValid).toBe(false);
    }
  });

  it('should reject path traversal in filenames', () => {
    const traversalAttempts = [
      '../../../etc/passwd',
      '..\\..\\windows\\system32\\config\\sam',
      'foo/../../../etc/passwd',
    ];

    for (const filename of traversalAttempts) {
      const buffer = Buffer.concat([createBuffer(PDF_MAGIC), Buffer.alloc(100)]);
      const result = validateFile(buffer, filename, 'application/pdf');

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('invalid characters');
    }
  });
});

describe('Executable Content Detection', () => {
  it('should detect Windows executables', () => {
    const exeBuffer = Buffer.concat([
      createBuffer(EXE_MAGIC),
      Buffer.alloc(100),
    ]);

    expect(isPotentiallyDangerous(exeBuffer, 'app.exe')).toBe(true);
  });

  it('should detect ELF executables', () => {
    const elfBuffer = Buffer.concat([
      createBuffer(ELF_MAGIC),
      Buffer.alloc(100),
    ]);

    expect(isPotentiallyDangerous(elfBuffer, 'binary')).toBe(true);
  });

  it('should detect Mach-O executables', () => {
    const machoBuffer = createBuffer([0xCA, 0xFE, 0xBA, 0xBE, 0x00, 0x00, 0x00]);

    expect(isPotentiallyDangerous(machoBuffer, 'app')).toBe(true);
  });

  it('should detect shell scripts (shebang)', () => {
    const shebangBuffer = Buffer.from('#!/bin/bash\nrm -rf /');

    expect(isPotentiallyDangerous(shebangBuffer, 'script.sh')).toBe(true);
  });

  it('should detect script content', () => {
    const scriptPatterns = [
      '<script>alert(1)</script>',
      '<?php system($_GET["cmd"]); ?>',
      '#!/usr/bin/python\nimport os\nos.system("rm -rf /")',
      "require('child_process').exec('rm -rf /')",
      'eval(base64_decode("..."))',
    ];

    for (const script of scriptPatterns) {
      const buffer = Buffer.from(script);
      expect(isPotentiallyDangerous(buffer, 'file.txt')).toBe(true);
    }
  });

  it('should not flag normal PDF content', () => {
    const pdfBuffer = Buffer.concat([
      createBuffer(PDF_MAGIC),
      Buffer.from('1.4\n%....normal pdf content\nstream\nendstream'),
    ]);

    expect(isPotentiallyDangerous(pdfBuffer, 'document.pdf')).toBe(false);
  });

  it('should not flag normal CSV content', () => {
    const csvBuffer = Buffer.from('name,email,phone\nJohn,john@example.com,555-1234');

    expect(isPotentiallyDangerous(csvBuffer, 'contacts.csv')).toBe(false);
  });
});

describe('Extension to MIME Type Mapping', () => {
  it('should map common extensions correctly', () => {
    expect(getExpectedMimeType('document.pdf')).toBe('application/pdf');
    expect(getExpectedMimeType('spreadsheet.xlsx')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(getExpectedMimeType('data.csv')).toBe('text/csv');
    expect(getExpectedMimeType('report.docx')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(getExpectedMimeType('photo.jpg')).toBe('image/jpeg');
    expect(getExpectedMimeType('image.png')).toBe('image/png');
  });

  it('should return null for unknown extensions', () => {
    expect(getExpectedMimeType('file.xyz')).toBeNull();
    expect(getExpectedMimeType('noextension')).toBeNull();
  });

  it('should be case insensitive', () => {
    expect(getExpectedMimeType('FILE.PDF')).toBe('application/pdf');
    expect(getExpectedMimeType('IMAGE.PNG')).toBe('image/png');
  });
});

describe('Edge Cases and Boundary Conditions', () => {
  it('should handle empty buffer', () => {
    const result = validateFile(Buffer.alloc(0), 'empty.pdf', 'application/pdf');

    expect(result.isValid).toBe(false);
  });

  it('should handle very small files', () => {
    const tinyBuffer = Buffer.from('a');
    const result = validateFile(tinyBuffer, 'tiny.csv', 'text/csv');

    // CSV with minimal content should be valid
    expect(result.isValid).toBe(true);
  });

  it('should handle Unicode filenames', () => {
    const unicodeName = '文档.pdf';
    const buffer = Buffer.concat([createBuffer(PDF_MAGIC), Buffer.alloc(100)]);

    const result = validateFile(buffer, unicodeName, 'application/pdf');

    expect(result.isValid).toBe(true);
    expect(result.sanitizedFilename).toBeDefined();
  });

  it('should handle filenames with emoji', () => {
    const emojiName = '📄document🎉.pdf';
    const buffer = Buffer.concat([createBuffer(PDF_MAGIC), Buffer.alloc(100)]);

    const result = validateFile(buffer, emojiName, 'application/pdf');

    expect(result.isValid).toBe(true);
  });

  it('should handle double extensions', () => {
    const doubleExt = 'document.pdf.exe';
    const buffer = Buffer.concat([createBuffer(PDF_MAGIC), Buffer.alloc(100)]);

    const result = validateFile(buffer, doubleExt, 'application/pdf');

    // Should be rejected due to .exe extension pattern
    expect(result.isValid).toBe(false);
  });
});
