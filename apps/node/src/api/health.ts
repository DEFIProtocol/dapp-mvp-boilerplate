/**
 * Express API router setup
 */

import express from 'express';
import { getConfig } from '@/core/config.js';
import { routingEngine } from '@/routing/engine.js';
import type { HealthStatus } from '@/core/types.js';

const router = express.Router();

/**
 * Health check endpoint
 */
router.get('/health', (_req, res) => {
  const health: HealthStatus = {
    status: 'healthy',
    checks: {
      database: true,
      contracts: true,
      governance: true,
      routing: routingEngine.isHealthy(),
    },
    uptime: process.uptime(),
    lastCheck: Date.now(),
  };

  res.json(health);
});

/**
 * Config check endpoint (requires admin access)
 */
router.get('/config', (_req, res) => {
  const config = getConfig();
  // Omit sensitive keys
  const { jwtSecret, nodePrivateKey, ...safeConfig } = config;
  res.json(safeConfig);
});

/**
 * Ready check (for orchestration)
 */
router.get('/ready', (_req, res) => {
  res.json({ ready: true });
});

export default router;
