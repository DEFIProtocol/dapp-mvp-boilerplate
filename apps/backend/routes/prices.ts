// backend/routes/prices.ts
import express from 'express';
import { globalPriceStore } from '../utils/globalPriceStore';

const router = express.Router();

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

export default router;