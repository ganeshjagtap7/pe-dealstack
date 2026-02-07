import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import dealsRouter from './routes/deals.js';
import companiesRouter from './routes/companies.js';
import activitiesRouter from './routes/activities.js';
import documentsRouter from './routes/documents.js';
import aiRouter from './routes/ai.js';
import foldersRouter from './routes/folders.js';
import usersRouter from './routes/users.js';
import chatRouter from './routes/chat.js';
import notificationsRouter from './routes/notifications.js';
import ingestRouter from './routes/ingest.js';
import memosRouter from './routes/memos.js';
import invitationsRouter from './routes/invitations.js';
import templatesRouter from './routes/templates.js';
import { supabase } from './supabase.js';
import { authMiddleware, optionalAuthMiddleware } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { log } from './utils/logger.js';

dotenv.config();

// ES Module dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// CORS - whitelist allowed origins
const allowedOrigins = [
  'https://pe-os.onrender.com',
  'http://localhost:3000',
  'http://localhost:5173',
];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all for now, log unknown origins
      log.warn('CORS request from unknown origin', { origin });
    }
  },
  credentials: true,
}));

// Rate limiting - protect API from abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

app.use(express.json());

// Request ID for error correlation
app.use(requestIdMiddleware);

// Health check - fast response for Render deployment (no DB query)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// Deep health check - includes database connectivity
app.get('/health/deep', async (req, res) => {
  try {
    const { error } = await supabase.from('Company').select('count', { count: 'exact', head: true });

    if (error) throw error;

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// API routes
app.get('/api', (req, res) => {
  res.json({
    message: 'AI CRM API v0.1.0',
    endpoints: {
      deals: '/api/deals',
      companies: '/api/companies',
      activities: '/api/activities',
      documents: '/api/documents',
      folders: '/api/deals/:dealId/folders',
      users: '/api/users',
      conversations: '/api/conversations',
      notifications: '/api/notifications',
      invitations: '/api/invitations',
      templates: '/api/templates',
      ai: '/api/ai',
      ingest: '/api/ingest',
      health: '/health',
    },
  });
});

// ========================================
// Public Debug Endpoints (no auth - dev only)
// ========================================

// Test FULL memo create flow (bypasses auth for debugging)
app.post('/api/debug/test-memo-insert', async (req, res) => {
  try {
    const steps: any[] = [];

    // Step 1: Create memo
    const testData = {
      title: 'Test Memo',
      projectName: 'Test Project',
      type: 'IC_MEMO',
      status: 'DRAFT',
    };

    const { data: memo, error: memoError } = await supabase
      .from('Memo')
      .insert(testData)
      .select()
      .single();

    if (memoError) {
      return res.json({ success: false, step: 'create_memo', error: memoError });
    }
    steps.push({ step: 'create_memo', success: true, memoId: memo.id });

    // Step 2: Create sections (like the real endpoint does)
    const defaultSections = [
      { memoId: memo.id, type: 'EXECUTIVE_SUMMARY', title: 'Executive Summary', sortOrder: 0 },
      { memoId: memo.id, type: 'FINANCIAL_PERFORMANCE', title: 'Financial Performance', sortOrder: 1 },
    ];

    const { error: sectionsError } = await supabase
      .from('MemoSection')
      .insert(defaultSections);

    if (sectionsError) {
      // Clean up memo
      await supabase.from('Memo').delete().eq('id', memo.id);
      return res.json({ success: false, step: 'create_sections', error: sectionsError });
    }
    steps.push({ step: 'create_sections', success: true });

    // Step 3: Fetch with sections
    const { data: fullMemo, error: fetchError } = await supabase
      .from('Memo')
      .select(`*, sections:MemoSection(*)`)
      .eq('id', memo.id)
      .single();

    if (fetchError) {
      await supabase.from('Memo').delete().eq('id', memo.id);
      return res.json({ success: false, step: 'fetch_with_sections', error: fetchError });
    }
    steps.push({ step: 'fetch_with_sections', success: true });

    // Clean up
    await supabase.from('Memo').delete().eq('id', memo.id);

    res.json({
      success: true,
      message: 'Full memo create flow works!',
      steps,
      testData: fullMemo
    });
  } catch (err: any) {
    console.error('TEST INSERT - Exception:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/debug/memo-table', async (req, res) => {
  try {
    // Check all memo-related tables
    const memoCheck = await supabase.from('Memo').select('id').limit(1);
    const sectionCheck = await supabase.from('MemoSection').select('id').limit(1);
    const convCheck = await supabase.from('MemoConversation').select('id').limit(1);

    res.json({
      Memo: { exists: !memoCheck.error, error: memoCheck.error?.message },
      MemoSection: { exists: !sectionCheck.error, error: sectionCheck.error?.message },
      MemoConversation: { exists: !convCheck.error, error: convCheck.error?.message },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ========================================
// Request tracing middleware for debugging
// ========================================
app.use('/api/memos', (req, res, next) => {
  console.log(`\n>>> [MEMOS] ${req.method} ${req.path}`);
  console.log('>>> [MEMOS] Headers authorization:', req.headers.authorization ? 'Bearer ***' : 'MISSING');
  console.log('>>> [MEMOS] Body:', JSON.stringify(req.body).substring(0, 200));
  next();
});

// ========================================
// Protected Routes (require authentication)
// ========================================
app.use('/api/deals', authMiddleware, dealsRouter);
app.use('/api/companies', authMiddleware, companiesRouter);
app.use('/api', authMiddleware, activitiesRouter);
app.use('/api', authMiddleware, documentsRouter);
app.use('/api', authMiddleware, foldersRouter);
app.use('/api/users', authMiddleware, usersRouter);
app.use('/api', authMiddleware, chatRouter);
app.use('/api/notifications', authMiddleware, notificationsRouter);
app.use('/api/ingest', authMiddleware, ingestRouter);
app.use('/api/memos', authMiddleware, memosRouter);
app.use('/api/templates', authMiddleware, templatesRouter);
app.use('/api/invitations', authMiddleware, invitationsRouter);

// ========================================
// Public Invitation Routes (no auth for verify/accept)
// ========================================
app.get('/api/invitations/verify/:token', invitationsRouter);
app.post('/api/invitations/accept/:token', invitationsRouter);

// ========================================
// AI Routes (mixed - some protected, some public)
// ========================================
// AI deal chat and analysis endpoints (require auth)
app.use('/api', authMiddleware, aiRouter);

// AI status endpoint (public - no auth required)
app.get('/api/ai/status', (req, res) => {
  const { isAIEnabled } = require('./openai.js');
  res.json({
    enabled: isAIEnabled(),
    model: 'gpt-4-turbo-preview',
  });
});

// ========================================
// Static Files (Production - serve frontend)
// ========================================
if (process.env.NODE_ENV === 'production') {
  // Serve static files from the web dist folder
  // From apps/api/dist/, web dist is at ../../web/dist
  const webPath = path.join(__dirname, '../../web/dist');
  app.use(express.static(webPath));

  // MPA fallback - serve specific HTML files or index.html
  app.get('*', (req, res, next) => {
    // Skip API routes
    if (req.path.startsWith('/api') || req.path === '/health') {
      return next();
    }

    // Try to serve the specific HTML file if it exists
    const htmlFile = req.path.endsWith('.html')
      ? req.path
      : `${req.path.replace(/\/$/, '')}.html`;

    const filePath = path.join(webPath, htmlFile);
    res.sendFile(filePath, (err) => {
      if (err) {
        // Fallback to index.html
        res.sendFile(path.join(webPath, 'index.html'));
      }
    });
  });
}

// 404 handler for unmatched routes
app.use(notFoundHandler);

// Global error handling middleware
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  log.info('API server started', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    version: 'v0.1.0',
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  log.info('Server shutting down gracefully');
  process.exit(0);
});
