import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
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
import { supabase } from './supabase.js';
import { authMiddleware, optionalAuthMiddleware } from './middleware/auth.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', async (req, res) => {
  try {
    // Test Supabase connection
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

// ========================================
// Public Routes (no authentication needed)
// ========================================
app.use('/api', aiRouter); // AI status check is public

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 API server running at http://localhost:${PORT}`);
  console.log(`🔐 Auth: Supabase JWT authentication enabled`);
  console.log('');
  console.log('Protected routes (require Bearer token):');
  console.log(`  📊 Deals API: http://localhost:${PORT}/api/deals`);
  console.log(`  🏢 Companies API: http://localhost:${PORT}/api/companies`);
  console.log(`  📋 Activities API: http://localhost:${PORT}/api/activities`);
  console.log(`  📄 Documents API: http://localhost:${PORT}/api/documents`);
  console.log(`  📁 Folders API: http://localhost:${PORT}/api/deals/:dealId/folders`);
  console.log(`  👥 Users API: http://localhost:${PORT}/api/users`);
  console.log(`  💬 Chat API: http://localhost:${PORT}/api/conversations`);
  console.log(`  🔔 Notifications API: http://localhost:${PORT}/api/notifications`);
  console.log(`  📥 Ingest API: http://localhost:${PORT}/api/ingest`);
  console.log(`  📝 Memos API: http://localhost:${PORT}/api/memos`);
  console.log('');
  console.log('Public routes (no auth required):');
  console.log(`  🤖 AI Status: http://localhost:${PORT}/api/ai/status`);
  console.log(`  ❤️  Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  process.exit(0);
});
