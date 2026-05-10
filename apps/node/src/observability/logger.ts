/**
 * Structured logging using Pino
 */

import pino from 'pino';
import { getConfig } from '@/core/config.js';

let logger: pino.Logger | null = null;

export function initLogger(): pino.Logger {
  const config = getConfig();
  logger = pino(
    {
      level: config.logLevel,
      transport:
        config.environment === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
              },
            }
          : undefined,
    },
    pino.destination()
  );

  return logger;
}

export function getLogger(): pino.Logger {
  if (!logger) {
    logger = initLogger();
  }
  return logger;
}
