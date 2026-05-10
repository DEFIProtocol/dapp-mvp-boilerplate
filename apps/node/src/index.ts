/**
 * Main daemon entry point
 * Boots the DCSN node: configuration → logging → governance → API → workers
 */

import { getConfig } from '@/core/config.js';
import { initLogger, getLogger } from '@/observability/logger.js';
import { startServer } from '@/api/app.js';
import { startWorkers } from '@/workers/index.js';

async function bootstrap(): Promise<void> {
  try {
    // 1. Load config from environment
    const config = getConfig();
    console.log(`[BOOTSTRAP] Environment: ${config.environment}`);

    // 2. Initialize logging
    const logger = initLogger();
    logger.info({ environment: config.environment }, 'Logger initialized');

    // 3. Initialize governance/identity
    logger.info('Initializing governance identity manager');
    // Identity manager starts with empty roles and normal governance state

    // 4. Start background workers
    logger.info('Starting background workers');
    startWorkers();

    // 5. Start Express server
    logger.info('Starting Express API server');
    await startServer();

    logger.info(
      { port: config.port, environment: config.environment },
      '✓ DCSN node daemon ready'
    );
  } catch (error) {
    console.error('[BOOTSTRAP ERROR]', error);
    process.exit(1);
  }
}

bootstrap();

// Graceful shutdown
process.on('SIGTERM', () => {
  const logger = getLogger();
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  const logger = getLogger();
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});
