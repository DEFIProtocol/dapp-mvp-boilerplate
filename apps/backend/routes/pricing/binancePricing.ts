import axios from 'axios';
import express, { Request, Response } from 'express';
import {
  initializeTokenPrices,
  getAllTokenPrices,
  startPeriodicRefresh,
  TokenPrice,
} from '../../pricing/binance/pricing';
import { shouldUseProxy, proxyRequest } from '../../middleware/apiProxy';
import { getServerMode } from '../../config/environment';

const router = express.Router();

// Only initialize if we have API keys (production mode)
const mode = getServerMode();
if (mode === 'production') {
  initializeTokenPrices();
  startPeriodicRefresh();
  console.log('✅ Binance: Using direct API connection');
} else if (mode === 'proxy') {
  console.log('🔗 Binance: Using proxy mode (Iron Relay API)');
} else {
  console.log('⚠️  Binance: No API keys configured');
}

/**
 * @route   GET /api/binance/prices
 * @desc    Get all token prices (updated via WebSocket)
 * @access  Public
 */
router.get('/prices', async (req: Request, res: Response) => {
  try {
    // If in proxy mode, forward to production API
    if (shouldUseProxy()) {
      const data = await proxyRequest('/api/binance/prices');
      return res.json(data);
    }
    
    // Otherwise use local data
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
router.get('/health', async (req: Request, res: Response) => {
  try {
    // If in proxy mode, forward to production API
    if (shouldUseProxy()) {
      const data = await proxyRequest('/api/binance/health');
      return res.json(data);
    }
    
    // Otherwise use local data
    const prices = getAllTokenPrices();
    
    res.json({
      success: true,
      exchange: 'binance',
      status: 'online',
      tokensTracked: prices.length,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Error fetching health:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch health status' 
    });
  }
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

    // If in proxy mode, forward to production API
    if (shouldUseProxy()) {
      const queryString = new URLSearchParams({
        symbol: String(symbol),
        interval: String(interval),
        limit: String(limit)
      }).toString();
      const data = await proxyRequest(`/api/binance/klines?${queryString}`);
      return res.json(data);
    }

    // Otherwise call Binance directly
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
