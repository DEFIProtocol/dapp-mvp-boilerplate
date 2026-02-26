// backend/routes/binancePricing.ts

import express, { Request, Response } from 'express';
import { 
  initializeTokenPrices,
  getAllTokenPrices,
  startPeriodicRefresh,
  TokenPrice
} from '../binance/pricing';

const router = express.Router();

// Initialize on startup
initializeTokenPrices();
startPeriodicRefresh();

/**
 * @route   GET /api/binance/prices
 * @desc    Get all token prices (updated via WebSocket)
 * @access  Public
 */
router.get('/prices', (req: Request, res: Response) => {
  try {
    const prices = getAllTokenPrices();
    
    res.json({
      success: true,
      count: prices.length,
      data: prices,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Error fetching prices:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch prices' 
    });
  }
});

/**
 * @route   GET /api/binance/health
 * @desc    Simple health check
 * @access  Public
 */
router.get('/health', (req: Request, res: Response) => {
  const prices = getAllTokenPrices();
  
  res.json({
    success: true,
    exchange: 'binance',
    status: 'online',
    tokensTracked: prices.length,
    timestamp: Date.now()
  });
});

export default router;