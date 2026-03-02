// backend/routes/pyth.ts
import express from 'express';
import { PythService } from '../pyth/pythService';
import { PYTH_PRICE_FEEDS } from '../pyth/types/pyth';

const router = express.Router();
const pythService = new PythService();

// Get latest price for a specific feed
router.get('/price/:feedId', async (req, res) => {
  try {
    const { feedId } = req.params;
    const price = await pythService.getPrice(feedId);
    
    if (!price) {
      return res.status(404).json({ error: 'Price not found' });
    }

    res.json({
      success: true,
      data: price
    });
  } catch (error) {
    console.error('Error in /price/:feedId:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get price by chain and symbol
router.get('/price/:chain/:symbol', async (req, res) => {
  try {
    const { chain, symbol } = req.params;
    
    const price = await pythService.getPriceBySymbol(chain, symbol);
    
    if (!price) {
      return res.status(404).json({ 
        error: `Price not found for ${symbol} on ${chain}` 
      });
    }

    // Format response for easier consumption
    const formattedPrice = {
      id: price.id,
      price: price.price.price * Math.pow(10, price.price.expo),
      conf: price.price.conf * Math.pow(10, price.price.expo),
      ema_price: price.ema_price ? 
        price.ema_price.price * Math.pow(10, price.ema_price.expo) : null,
      publish_time: price.price.publishTime * 1000,
      raw: price
    };

    res.json({
      success: true,
      chain,
      symbol,
      data: formattedPrice
    });
  } catch (error: any) {
    console.error('Error in /price/:chain/:symbol:', error);
    res.status(error.message.includes('Unsupported') ? 400 : 500)
      .json({ error: error.message });
  }
});

// Get EMA price for funding rate calculations
router.get('/ema/:feedId', async (req, res) => {
  try {
    const { feedId } = req.params;
    const emaPrice = await pythService.getEMAPrice(feedId);
    
    if (emaPrice === null) {
      return res.status(404).json({ error: 'EMA price not found' });
    }

    res.json({
      success: true,
      feedId,
      ema_price: emaPrice
    });
  } catch (error) {
    console.error('Error in /ema/:feedId:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get price with confidence interval
router.get('/price-with-confidence/:feedId', async (req, res) => {
  try {
    const { feedId } = req.params;
    const priceData = await pythService.getPriceWithConfidence(feedId);
    
    if (!priceData) {
      return res.status(404).json({ error: 'Price not found' });
    }

    res.json({
      success: true,
      feedId,
      data: priceData
    });
  } catch (error) {
    console.error('Error in /price-with-confidence/:feedId:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get batch prices
router.post('/prices/batch', async (req, res) => {
  try {
    const { feedIds } = req.body;
    
    if (!feedIds || !Array.isArray(feedIds)) {
      return res.status(400).json({ error: 'feedIds array is required' });
    }

    const prices = await pythService.getBatchPrices(feedIds);
    
    // Convert Map to object for JSON response
    const result: any = {};
    prices.forEach((value, key) => {
      result[key] = value;
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error in /prices/batch:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get historical prices
router.get('/historical/:feedId', async (req, res) => {
  try {
    const { feedId } = req.params;
    const hours = parseInt(req.query.hours as string) || 24;
    
    const historicalPrices = await pythService.getHistoricalPrices(feedId, hours);
    
    // Format for easier consumption
    const formattedPrices = historicalPrices.map(feed => ({
      price: feed.price.price * Math.pow(10, feed.price.expo),
      ema_price: feed.ema_price ? 
        feed.ema_price.price * Math.pow(10, feed.ema_price.expo) : null,
      publish_time: feed.price.publishTime * 1000
    }));

    res.json({
      success: true,
      feedId,
      hours,
      count: formattedPrices.length,
      data: formattedPrices
    });
  } catch (error) {
    console.error('Error in /historical/:feedId:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get available feeds for a chain
router.get('/feeds/:chain', async (req, res) => {
  try {
    const { chain } = req.params;
    const feeds = pythService.getAvailableFeeds(chain);
    
    res.json({
      success: true,
      chain,
      feeds
    });
  } catch (error) {
    console.error('Error in /feeds/:chain:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all available price feed metadata
router.get('/feed-metadata', async (req, res) => {
  try {
    const metadata = await pythService.getPriceFeedMetadata();
    res.json({
      success: true,
      data: metadata
    });
  } catch (error) {
    console.error('Error in /feed-metadata:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Calculate funding rate
router.get('/funding-rate/:feedId', async (req, res) => {
  try {
    const { feedId } = req.params;
    
    const priceFeed = await pythService.getPrice(feedId);
    if (!priceFeed || !priceFeed.ema_price) {
      return res.status(404).json({ error: 'Price or EMA not found' });
    }

    const spotPrice = priceFeed.price.price * Math.pow(10, priceFeed.price.expo);
    const emaPrice = priceFeed.ema_price.price * Math.pow(10, priceFeed.ema_price.expo);
    
    const fundingRate = pythService.calculateFundingRate(spotPrice, emaPrice);

    res.json({
      success: true,
      feedId,
      spot_price: spotPrice,
      ema_price: emaPrice,
      funding_rate: fundingRate,
      funding_rate_percent: fundingRate * 100,
      annualized_rate: fundingRate * 24 * 365 * 100 // Annualized percentage
    });
  } catch (error) {
    console.error('Error in /funding-rate/:feedId:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
router.get('/health', async (req, res) => {
  try {
    // Try to fetch a known price feed to check connectivity
    const testFeedId = PYTH_PRICE_FEEDS.ethereum['eth/usd'];
    const price = await pythService.getPrice(testFeedId);
    
    res.json({
      success: true,
      status: 'healthy',
      pyth_connected: !!price,
      timestamp: Date.now()
    });
  } catch (error) {
    res.json({
      success: false,
      status: 'degraded',
      error: 'Failed to connect to Pyth',
      timestamp: Date.now()
    });
  }
});

export default router;