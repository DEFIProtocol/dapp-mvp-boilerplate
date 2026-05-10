/**
 * Main Express application setup
 */

import express from 'express';
import { getLogger } from '@/observability/logger.js';
import { getConfig } from '@/core/config.js';
import healthRouter from '@/api/health.js';
import routingRouter from '@/api/routing.js';

export function createApp(): express.Application {
  const app = express();
  const logger = getLogger();

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Request logging middleware
  app.use((req, _res, next) => {
    logger.debug({ method: req.method, path: req.path }, 'Incoming request');
    next();
  });

  // Routes
  app.use('/api/health', healthRouter);
  app.use('/api/routing', routingRouter);

  // Error handling middleware
  app.use(
    (
      err: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      logger.error({ err }, 'Unhandled error');
      res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      });
    }
  );

  return app;
}

export async function startServer(): Promise<void> {
  const config = getConfig();
  const app = createApp();
  const logger = getLogger();

  return new Promise((resolve, reject) => {
    const server = app.listen(config.port, () => {
      logger.info({ port: config.port }, 'Node daemon started');
      resolve();
    });

    server.on('error', (err) => {
      logger.error({ err }, 'Server error');
      reject(err);
    });
  });
}
