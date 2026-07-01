import express from 'express';
import path from 'path';
import helmet from 'helmet';
import morgan from 'morgan';
import { createServer as createViteServer } from 'vite';
import { logger } from './backend/src/utils/logger';

// Import Routes
import authRoutes from './backend/src/routes/auth.routes';
import walletRoutes from './backend/src/routes/wallet.routes';
import adminRoutes from './backend/src/routes/admin.routes';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Set trust proxy to true/1 so express-rate-limit knows it's behind a proxy
  app.set('trust proxy', 1);

  // 1. Production Security Headers using Helmet
  app.use(
    helmet({
      contentSecurityPolicy: false, // Disabled for local Vite preview integrations and sub-frame execution
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' }
    })
  );

  // 2. Logging and Parsing Middlewares
  app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // 3. API Routes Mounting
  app.use('/api/auth', authRoutes);
  app.use('/api/wallet', walletRoutes);
  app.use('/api/admin', adminRoutes);

  app.get('/api/health', (req, res) => {
    res.json({ success: true, status: 'healthy', timestamp: new Date().toISOString() });
  });

  // Global Error Handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error('Unhandled server exception:', { error: err.message, stack: err.stack });
    res.status(500).json({
      success: false,
      message: 'Internal server security error. Operation aborted.'
    });
  });

  // 4. Vite Frontend Middleware Setup
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
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`TronNest Server is fully operational on port ${PORT}`);
  });
}

startServer().catch((e) => {
  console.error('Fatal server boot failure:', e);
});
