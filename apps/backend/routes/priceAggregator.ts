// apps/backend/routes/priceAggregator.ts
import express from 'express';
import { getAggregatedPrice, getSupportedSymbols } from '../utils/priceAggregator';

const router = express.Router();

/**
 * GET /api/aggregator/:symbol
 * Full validated price breakdown for a single market (e.g. /api/aggregator/ETH).
 * Includes circuit-breaker status, source freshness, and divergence metrics.
 */
router.get('/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const result = await getAggregatedPrice(symbol);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: `Unsupported symbol: ${symbol.toUpperCase()}. Supported: ${getSupportedSymbols().join(', ')}`,
      });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[priceAggregator route] error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * GET /api/aggregator
 * Snapshot of all supported markets at once.
 */
router.get('/', async (_req, res) => {
  try {
    const symbols = getSupportedSymbols();
    const results = await Promise.all(symbols.map(s => getAggregatedPrice(s)));
    const valid   = results.filter(Boolean);

    res.json({
      success: true,
      count: valid.length,
      data: valid,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[priceAggregator route] error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

export default router;
