// backend/routes/coinbasePricing.ts

import express, { Request, Response } from 'express';
import { 
  initializeTokenPrices,
  getAllTokenPrices,
  startPeriodicRefresh,
  TokenPrice
} from '../coinbase/pricing';

const router = express.Router();

// Initialize on startup
initializeTokenPrices();
startPeriodicRefresh();

/**
 * @route   GET /api/coinbase/prices
 * @desc    Get all Coinbase token prices (updated via WebSocket)
 * @access  Public
 */
router.get('/prices', (req: Request, res: Response) => {
  try {
    const prices = getAllTokenPrices();
    
    res.json({
      success: true,
      exchange: 'coinbase',
      count: prices.length,
      data: prices,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Error fetching Coinbase prices:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch Coinbase prices' 
    });
  }
});

/**
 * @route   GET /api/coinbase/health
 * @desc    Simple health check
 * @access  Public
 */
router.get('/health', (req: Request, res: Response) => {
  const prices = getAllTokenPrices();
  
  res.json({
    success: true,
    exchange: 'coinbase',
    status: 'online',
    tokensTracked: prices.length,
    timestamp: Date.now()
  });
});

export default router;