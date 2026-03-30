// backend/routes/prices.ts
import express from 'express';
import { globalPriceStore } from '../../utils/globalPriceStore';

const router = express.Router();

type PriceEntry = {
  symbol: string;
  marketCap?: number;
  change24h?: number;
  priceSource?: string;
};

const hasPairedMetadata = (entry: PriceEntry): boolean => {
  const hasCap = typeof entry.marketCap === 'number' && Number.isFinite(entry.marketCap);
  const hasChange = typeof entry.change24h === 'number' && Number.isFinite(entry.change24h);
  return (hasCap && hasChange) || (!hasCap && !hasChange);
};

router.get('/prices', (req, res) => {
  const prices = globalPriceStore.getAllPrices();
  const stats = globalPriceStore.getStats();
  
  res.json({
    success: true,
    count: prices.length,
    data: prices,
    stats,
    timestamp: Date.now()
  });
});

router.get('/prices/diagnostics', (_req, res) => {
  const prices = globalPriceStore.getAllPrices() as PriceEntry[];

  const mismatchedMetadata = prices.filter((entry) => !hasPairedMetadata(entry));
  const withMetadata = prices.filter(
    (entry) => typeof entry.marketCap === 'number' && typeof entry.change24h === 'number'
  );

  res.json({
    success: true,
    total: prices.length,
    pairedMetadataCount: withMetadata.length,
    mismatchedMetadataCount: mismatchedMetadata.length,
    mismatchedMetadata: mismatchedMetadata.slice(0, 100),
    timestamp: Date.now(),
  });
});

export default router;