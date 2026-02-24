import * as Sentry from '@sentry/node';
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
import auditRouter from './routes/audit.js';
import tasksRouter from './routes/tasks.js';
import contactsRouter from './routes/contacts.js';
import exportRouter from './routes/export.js';
import { supabase } from './supabase.js';
import { authMiddleware, optionalAuthMiddleware } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { log } from './utils/logger.js';

dotenv.config();

// Validate required environment variables at startup
const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
const optionalEnvVars = ['OPENAI_API_KEY', 'GEMINI_API_KEY'];

const missingRequired = requiredEnvVars.filter(key => !process.env[key]);
if (missingRequired.length > 0) {
  log.error('Missing required environment variables', undefined, { missing: missingRequired });
  process.exit(1);
}

const missingOptional = optionalEnvVars.filter(key => !process.env[key]);
if (missingOptional.length > 0) {
  log.warn('Optional environment variables not set (some features disabled)', { missing: missingOptional });
}

// Initialize Sentry for error tracking (production only)
if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
  });
  log.info('Sentry error tracking initialized');
}

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
      log.warn('CORS request rejected', { origin });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// Rate limiting - protect API from abuse
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // 200 requests per 15 min for general API
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 AI requests per minute (expensive calls)
  message: { error: 'Too many AI requests, please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const writeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 writes per minute
  message: { error: 'Too many write operations, please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', generalLimiter);
app.use('/api/ai', aiLimiter);
app.use('/api/memos/*/chat', aiLimiter);
app.use('/api/memos/*/sections/*/generate', aiLimiter);
app.use('/api/ingest', writeLimiter);

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

// Readiness check - comprehensive service health
app.get('/health/ready', async (_req, res) => {
  const checks: { timestamp: string; status: string; services: Record<string, { ok: boolean; latencyMs?: number; configured?: boolean }> } = {
    timestamp: new Date().toISOString(),
    status: 'checking',
    services: {},
  };

  try {
    const dbStart = Date.now();
    const { error: dbError } = await supabase
      .from('Deal')
      .select('count', { count: 'exact', head: true });
    checks.services.database = { ok: !dbError, latencyMs: Date.now() - dbStart };

    checks.services.openai = {
      ok: !!process.env.OPENAI_API_KEY,
      configured: !!process.env.OPENAI_API_KEY,
    };

    checks.services.gemini = {
      ok: !!process.env.GEMINI_API_KEY,
      configured: !!process.env.GEMINI_API_KEY,
    };

    checks.services.sentry = {
      ok: !!process.env.SENTRY_DSN,
      configured: !!process.env.SENTRY_DSN,
    };

    const allHealthy = Object.values(checks.services).every(s => s.ok);
    checks.status = allHealthy ? 'healthy' : 'degraded';

    res.status(allHealthy ? 200 : 503).json(checks);
  } catch (err) {
    checks.status = 'unhealthy';
    res.status(503).json(checks);
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
app.use('/api/audit', authMiddleware, auditRouter);
app.use('/api/tasks', authMiddleware, tasksRouter);
app.use('/api/export', authMiddleware, exportRouter);
app.use('/api/contacts', authMiddleware, contactsRouter);

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
    model: 'gpt-4o',
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

// Sentry error handler (must be before custom error handler)
if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
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
