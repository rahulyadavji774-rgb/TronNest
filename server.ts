import express from 'express';
import path from 'path';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cors from 'cors';

import { createServer as createViteServer } from 'vite';
import { logger } from './backend/src/utils/logger';

// Import Routes
import authRoutes from './backend/src/routes/auth.routes';
import walletRoutes from './backend/src/routes/wallet.routes';
import adminRoutes from './backend/src/routes/admin.routes';

// Import DB Init
import { initDb } from './backend/src/db';
import { runBackgroundJobs } from './backend/src/services/SchedulerService';

async function startServer() {
  // Initialize Database
  try {
    await initDb(process.env.DATABASE_URL);
    logger.info(process.env.DATABASE_URL ? 'MariaDB connected successfully' : 'Using Local JSON Database');
    
    // Health check
    try {
      const { JsonDatabase } = await import('./backend/src/config/db');
      const db = JsonDatabase.getInstance();
      const wallets = await db.query('wallets');
      const users = await db.query('users');
      logger.info(`Startup Health Check Passed: Wallets loaded: ${wallets.length}. Users loaded: ${users.length}.`);

      const tokens = await db.query('tokens');
      if (tokens.length === 0) {
        logger.info('No tokens found. Creating default MUSD token.');
        const newToken = await db.insert<any>('tokens', {
          name: 'TronNest USD',
          symbol: 'MUSD',
          decimals: 6,
          logoUrl: 'https://images.unsplash.com/photo-1621416894569-0f39ed31d247?q=80&w=200&auto=format&fit=crop',
          description: 'TronNest USD Stablecoin',
          is_visible: true,
          is_transfer_enabled: true,
          is_active: true,
          is_internal: true
        });
        await db.insert<any>('token_prices', {
          token_id: (newToken as any).id,
          price_usd: 1.0
        });
      }
    } catch (e: any) {
      logger.error('Startup Health Check Failed: ' + e.message);
      process.exit(1);
    }
    
    // Start Background Jobs & Scheduler
    runBackgroundJobs();
  } catch (err) {
    logger.error('Failed to initialize database:', err);
    process.exit(1);
  }

  const app = express();
  const PORT = 3000;

  // Set trust proxy to true/1 so express-rate-limit knows it's behind a proxy
  app.set('trust proxy', 1);

  // 1. Production Security Headers using Helmet & CORS
  app.use(cors({ origin: '*' })); // Configure properly in actual production
  app.use(
    helmet({
      contentSecurityPolicy: false, // Disabled for local Vite preview integrations and sub-frame execution
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      xssFilter: true, // XSS Protection
      noSniff: true
    })
  );

  // 2. Performance & Compression
  app.use(compression());


  // 4. Logging and Parsing Middlewares
  app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));
  app.use(express.json({ limit: '10kb' })); // Body limit for payload size
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));

  // 5. API Routes Mounting
    app.use('/api/auth', authRoutes);
  app.use('/api/wallet', walletRoutes);
  app.use('/api/admin', adminRoutes);

  // Advanced Health Monitoring Endpoint
  app.get('/api/health', (req, res) => {
    const memory = process.memoryUsage();
    res.json({ 
      success: true, 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        rss: `${Math.round(memory.rss / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memory.heapTotal / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memory.heapUsed / 1024 / 1024)}MB`,
      }
    });
  });

  // Global Error Handler & Crash Recovery
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error('Unhandled server exception:', { error: err.message, stack: err.stack, path: req.path });
    
    // Automatic Bug Fix Suggestions Logged
    logger.info('Bug Suggestion: Check if the route exists and parameter types match exactly. Ensure Database connection is active.');
    
    res.status(err.status || 500).json({
      success: false,
      message: err.message || 'Internal server error'
    });
  });

  // 6. Vite Frontend Middleware Setup
  if (process.env.NODE_ENV !== 'production') {
    logger.info('Starting dev server with Vite live middleware integration');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    logger.info('Starting production server with static assets');
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, { maxAge: '1y' })); // Caching static files
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`TronNest Server is fully operational on port ${PORT}`);
  });
}

// Global process handlers for Crash Recovery
process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT EXCEPTION! Shutting down...', err);
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  logger.error('UNHANDLED REJECTION! Shutting down...', err);
  process.exit(1);
});

startServer().catch((e) => {
  console.error('Fatal server boot failure:', e);
});
