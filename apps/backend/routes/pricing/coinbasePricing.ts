import axios from 'axios';
import express, { Request, Response } from 'express';
import {
  initializeTokenPrices,
  getAllTokenPrices,
  startPeriodicRefresh,
  TokenPrice,
} from '../../pricing/coinbase/pricing';
import { shouldUseProxy, proxyRequest } from '../../middleware/apiProxy';
import { getServerMode } from '../../config/environment';

const router = express.Router();

// Only initialize if we have API keys (production mode)
const mode = getServerMode();
if (mode === 'production') {
  initializeTokenPrices();
  startPeriodicRefresh();
  console.log('✅ Coinbase: Using direct API connection');
} else if (mode === 'proxy') {
  console.log('🔗 Coinbase: Using proxy mode (Iron Relay API)');
} else {
  console.log('⚠️  Coinbase: No API keys configured');
}

/**
 * @route   GET /api/coinbase/prices
 * @desc    Get all Coinbase token prices (updated via WebSocket)
 * @access  Public
 */
router.get('/prices', async (req: Request, res: Response) => {
  try {
    // If in proxy mode, forward to production API
    if (shouldUseProxy()) {
      const data = await proxyRequest('/api/coinbase/prices');
      return res.json(data);
    }
    
    // Otherwise use local data
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
router.get('/health', async (req: Request, res: Response) => {
  try {
    // If in proxy mode, forward to production API
    if (shouldUseProxy()) {
      const data = await proxyRequest('/api/coinbase/health');
      return res.json(data);
    }
    
    // Otherwise use local data
    const prices = getAllTokenPrices();
    
    res.json({
      success: true,
      exchange: 'coinbase',
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


router.get('/candles', async (req: Request, res: Response) => {
  try {
    const { product_id, granularity = 3600 } = req.query;
    
    if (!product_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'product_id is required (e.g., ETH-USD)' 
      });
    }

    // If in proxy mode, forward to production API
    if (shouldUseProxy()) {
      const queryString = new URLSearchParams({
        product_id: String(product_id),
        granularity: String(granularity)
      }).toString();
      const data = await proxyRequest(`/api/coinbase/candles?${queryString}`);
      return res.json(data);
    }

    // Otherwise call Coinbase directly
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
