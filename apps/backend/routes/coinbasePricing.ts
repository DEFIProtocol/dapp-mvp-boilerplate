import axios from 'axios';
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


router.get('/candles', async (req: Request, res: Response) => {
  try {
    const { product_id, granularity = 3600 } = req.query;
    
    if (!product_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'product_id is required (e.g., ETH-USD)' 
      });
    }

    const response = await axios.get(
      `https://api.exchange.coinbase.com/products/${product_id}/candles`, {
        params: {
          granularity: Number(granularity)
        }
      }
    );

    // Coinbase returns: [time, low, high, open, close, volume]
    const candles = response.data.map((candle: any[]) => ({
      timestamp: candle[0] * 1000, // Convert to ms
      low: candle[1],
      high: candle[2],
      open: candle[3],
      close: candle[4],
      volume: candle[5]
    }));

    res.json({
      success: true,
      exchange: 'coinbase',
      product_id,
      granularity,
      count: candles.length,
      data: candles
    });
  } catch (error) {
    console.error('Error fetching Coinbase candles:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch candle data' 
    });
  }
});