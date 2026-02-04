/**
 * Test Setup
 * Configure mock environment for API tests
 */

import { vi, beforeAll, afterAll, afterEach } from 'vitest';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.OPENAI_API_KEY = 'test-openai-key';

// Mock Supabase client
vi.mock('../src/supabase.js', () => ({
  supabase: {
    from: vi.fn((table: string) => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
    })),
  },
}));

// Mock auth middleware
vi.mock('../src/middleware/auth.js', () => ({
  authMiddleware: (req: any, res: any, next: any) => {
    req.user = {
      id: 'test-user-id',
      email: 'test@example.com',
      role: 'ADMIN',
    };
    next();
  },
  optionalAuthMiddleware: (req: any, res: any, next: any) => {
    next();
  },
}));

// Mock RBAC middleware
vi.mock('../src/middleware/rbac.js', () => ({
  requirePermission: () => (req: any, res: any, next: any) => next(),
  PERMISSIONS: {
    DEAL_VIEW: 'deal:view',
    DEAL_CREATE: 'deal:create',
    DEAL_UPDATE: 'deal:update',
    DEAL_DELETE: 'deal:delete',
    DOCUMENT_VIEW: 'document:view',
    DOCUMENT_UPLOAD: 'document:upload',
    DOCUMENT_DELETE: 'document:delete',
  },
}));

// Mock audit log
vi.mock('../src/services/auditLog.js', () => ({
  AuditLog: {
    dealCreated: vi.fn(),
    dealUpdated: vi.fn(),
    dealDeleted: vi.fn(),
    documentUploaded: vi.fn(),
    documentDeleted: vi.fn(),
    aiChat: vi.fn(),
  },
}));

// Mock OpenAI
vi.mock('../src/openai.js', () => ({
  openai: null,
  isAIEnabled: () => false,
}));

// Mock Gemini/RAG
vi.mock('../src/gemini.js', () => ({
  isGeminiEnabled: () => false,
}));

vi.mock('../src/rag.js', () => ({
  searchDocumentChunks: vi.fn().mockResolvedValue([]),
  buildRAGContext: vi.fn().mockReturnValue(''),
}));

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
});
