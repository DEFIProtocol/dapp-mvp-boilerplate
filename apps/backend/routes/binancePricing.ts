import axios from 'axios';
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


router.get('/klines', async (req: Request, res: Response) => {
  try {
    const { symbol, interval = '1h', limit = 500 } = req.query;
    
    if (!symbol) {
      return res.status(400).json({ 
        success: false, 
        error: 'Symbol is required' 
      });
    }

    const response = await axios.get(
      `https://api.binance.us/api/v3/klines`, {
        params: {
          symbol: String(symbol).toUpperCase(),
          interval: String(interval),
          limit: Number(limit)
        }
      }
    );

    // Format the data to be more usable
    const candles = response.data.map((kline: any[]) => ({
      timestamp: kline[0],
      open: parseFloat(kline[1]),
      high: parseFloat(kline[2]),
      low: parseFloat(kline[3]),
      close: parseFloat(kline[4]),
      volume: parseFloat(kline[5]),
      closeTime: kline[6],
      quoteVolume: parseFloat(kline[7]),
      trades: kline[8]
    }));

    res.json({
      success: true,
      exchange: 'binance',
      symbol,
      interval,
      count: candles.length,
      data: candles
    });
  } catch (error) {
    console.error('Error fetching Binance klines:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch klines data' 
    });
  }
});