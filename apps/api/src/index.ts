import app from './app.js';
import { log } from './utils/logger.js';

const PORT = process.env.PORT || 3001;

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
