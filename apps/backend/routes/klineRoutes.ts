import express from 'express';
import { fetchHistoricalKlines, subscribeToKline } from '../binance/klines';
import { fetchCoinbaseCandles } from '../coinbase/klines';
import { klineStore } from '../utils/KlineStore';

const router = express.Router();

const intervalToCoinbaseGranularity = (interval: string): number => {
  const map: Record<string, number> = {
    '1m': 60,
    '5m': 300,
    '15m': 900,
    '1h': 3600,
    '4h': 14400,
    '6h': 21600,
    '1d': 86400,
  };

  return map[interval] ?? 60;
};

router.get('/', async (req, res) => {
  const { symbol, interval = '1m', fallback = 'true', limit = '1000' } = req.query;

  if (!symbol) {
    return res.status(400).json({ error: 'symbol required' });
  }

  const parsedLimit = Number(limit);
  const safeLimit = Number.isFinite(parsedLimit)
    ? Math.min(1000, Math.max(1, Math.floor(parsedLimit)))
    : 1000;

  try {
    await fetchHistoricalKlines(String(symbol), String(interval), safeLimit);
    subscribeToKline(String(symbol), String(interval));

    return res.json({
      success: true,
      exchange: 'binance',
      data: klineStore.get(String(symbol), String(interval))
    });
  } catch (err) {
    if (fallback === 'true') {
      const intervalKey = String(interval);
      const granularity = intervalToCoinbaseGranularity(intervalKey);

      await fetchCoinbaseCandles(
        `${String(symbol).replace('USDT', '')}-USD`,
        granularity,
        safeLimit
      );

      return res.json({
        success: true,
        exchange: 'coinbase',
        data: klineStore.get(String(symbol), `${granularity}s`)
      });
    }

    res.status(500).json({ error: 'failed to fetch klines' });
  }
});

export default router;