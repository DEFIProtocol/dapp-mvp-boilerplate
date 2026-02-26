import express, { Request, Response } from 'express';
import {
  createRequest,
  batchRequest,
  getRateLimiterStats,
  getCacheStats,
  clearCache,
  CoinRankingResponse,
  CoinsResponse,
  CoinDetailResponse,
  HistoryResponse
} from '../coinranking/tokenPricing';

const router = express.Router();

// Get all coins with pagination
router.get('/coins', async (req: Request, res: Response) => {
  try {
    const { limit = 1200, offset = 0 } = req.query;
    
    const data = await createRequest<CoinRankingResponse<CoinsResponse>>('/coins', { 
      limit: Math.min(Number(limit), 1500),
      offset: Number(offset),
      referenceCurrencyUuid: 'yhjMzLPhuIDl' // USD
    });
    
    res.json({
      success: true,
      data: data.data,
      stats: data.data?.stats,
      metadata: {
        cache: getCacheStats(),
        rateLimiter: getRateLimiterStats()
      },
      timestamp: new Date().toISOString(),
      source: 'coinranking'
    });
  } catch (error) {
    console.error('Error fetching coins:', error);
    res.status(error instanceof Error && 'response' in error ? (error as any).response?.status || 500 : 500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch coins',
      metadata: {
        rateLimiter: getRateLimiterStats()
      }
    });
  }
});

// Get specific coin details
router.get('/coin/:coinId', async (req: Request, res: Response) => {
  try {
    const { coinId } = req.params;
    const { referenceCurrencyUuid = 'yhjMzLPhuIDl', timePeriod = '24h' } = req.query;
    
    if (!coinId) {
      return res.status(400).json({
        success: false,
        error: 'Coin ID is required'
      });
    }
    
    const data = await createRequest<CoinRankingResponse<CoinDetailResponse>>(`/coin/${coinId}`, {
      referenceCurrencyUuid: referenceCurrencyUuid as string,
      timePeriod: timePeriod as string
    });
    
    res.json({
      success: true,
      data: data.data,
      metadata: {
        cache: getCacheStats()
      },
      timestamp: new Date().toISOString(),
      source: 'coinranking'
    });
  } catch (error) {
    console.error('Error fetching coin details:', error);
    res.status(error instanceof Error && 'response' in error ? (error as any).response?.status || 500 : 500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch coin details'
    });
  }
});

// Get coin history
router.get('/coin/:coinId/history', async (req: Request, res: Response) => {
  try {
    const { coinId } = req.params;
    const { timePeriod = '24h' } = req.query;
    
    if (!coinId) {
      return res.status(400).json({
        success: false,
        error: 'Coin ID is required'
      });
    }
    
    const data = await createRequest<CoinRankingResponse<HistoryResponse>>(`/coin/${coinId}/history`, { 
      timePeriod: timePeriod as string 
    });
    
    res.json({
      success: true,
      data: data.data,
      timestamp: new Date().toISOString(),
      metadata: {
        coinId,
        timePeriod,
        change: data.data?.change,
        historyCount: data.data?.history?.length || 0,
        cache: getCacheStats()
      },
      source: 'coinranking'
    });
  } catch (error) {
    console.error('Error fetching coin history:', error);
    res.status(error instanceof Error && 'response' in error ? (error as any).response?.status || 500 : 500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch coin history'
    });
  }
});

// Batch endpoint for multiple coins
router.post('/batch/coins', async (req: Request, res: Response) => {
  try {
    const { coinIds = [] } = req.body;
    
    if (!Array.isArray(coinIds) || coinIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'coinIds array is required'
      });
    }
    
    const limitedIds = coinIds.slice(0, 100);
    
    const requests = limitedIds.map(coinId => ({
      coinId,
      endpoint: `/coin/${coinId}`,
      params: { referenceCurrencyUuid: 'yhjMzLPhuIDl' }
    }));
    
    const batchResult = await batchRequest(requests);
    
    res.json({
      success: true,
      data: batchResult,
      timestamp: new Date().toISOString(),
      metadata: {
        total: limitedIds.length,
        received: Object.keys(batchResult).length,
        cache: getCacheStats(),
        rateLimiter: getRateLimiterStats()
      },
      source: 'coinranking-batch'
    });
  } catch (error) {
    console.error('Error in batch request:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch batch data'
    });
  }
});

// Stats endpoint
router.get('/stats', (req: Request, res: Response) => {
  res.json({
    success: true,
    stats: {
      cache: getCacheStats(),
      rateLimiter: getRateLimiterStats()
    },
    endpoints: {
      coins: '/coins?limit=:limit&offset=:offset',
      coin: '/coin/:coinId',
      history: '/coin/:coinId/history?timePeriod=:period',
      batch: 'POST /batch/coins',
      stats: '/stats'
    },
    timestamp: new Date().toISOString()
  });
});

// Clear cache (admin only)
router.delete('/cache', (req: Request, res: Response) => {
  const clearedCount = clearCache();
  
  res.json({
    success: true,
    message: `Cleared ${clearedCount} cached items`,
    timestamp: new Date().toISOString()
  });
});

export default router;