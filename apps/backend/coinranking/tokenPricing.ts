import axios, { AxiosError } from 'axios';
import { globalPriceStore } from '../utils/globalPriceStore';



// RapidAPI CoinRanking configuration
const RAPID_API_HOST = process.env.RAPID_API_HOST || 'coinranking1.p.rapidapi.com';
const RAPID_API_KEY = process.env.RAPID_API_KEY;

// Rate limiting configuration
const RAPID_API_LIMIT = 50; // RapidAPI free tier: 50 requests per minute
const RAPID_API_WINDOW = 60 * 1000; // 1 minute in milliseconds

// Cache configuration
const RAPID_CACHE_TTL = 30 * 1000; // 30 seconds

// Rate limiter state
interface RateLimiterState {
  requests: number[];
  queue: Array<() => Promise<void>>;
  processing: boolean;
}

const rateLimiter: RateLimiterState = {
  requests: [],
  queue: [],
  processing: false
};

// Cache for API responses
interface CacheEntry {
  data: any;
  timestamp: number;
  endpoint: string;
}

const rapidApiCache = new Map<string, CacheEntry>();

// Types for responses
export interface CoinRankingResponse<T> {
  status: string;
  data: T;
}

export interface CoinsResponse {
  coins: Array<{
    uuid: string;
    symbol: string;
    name: string;
    iconUrl: string;
    price: string;
    change: string;
    rank: number;
    marketCap?: string;
    "24hVolume"?: string;
  }>;
  stats: {
    total: number;
    totalCoins: number;
    totalMarkets: number;
    totalExchanges: number;
    totalMarketCap: string;
    total24hVolume: string;
  };
}

export interface CoinDetailResponse {
  coin: {
    uuid: string;
    symbol: string;
    name: string;
    description: string;
    iconUrl: string;
    websiteUrl: string;
    price: string;
    change: string;
    rank: number;
    marketCap: string;
    volume24h: string;
    allTimeHigh: {
      price: string;
      timestamp: number;
    };
    numberOfMarkets: number;
    numberOfExchanges: number;
    supply: {
      confirmed: boolean;
      total: string;
      circulating: string;
    };
  };
}

export interface HistoryResponse {
  change: string;
  history: Array<{
    price: string;
    timestamp: number;
  }>;
}

// Clean old requests from rate limiter
const cleanOldRequests = (): void => {
  const now = Date.now();
  rateLimiter.requests = rateLimiter.requests.filter(
    timestamp => now - timestamp < RAPID_API_WINDOW
  );
};

// Check if we can make a request
const canMakeRequest = (): boolean => {
  cleanOldRequests();
  return rateLimiter.requests.length < RAPID_API_LIMIT;
};

// Get time until next available slot
const getTimeUntilNextSlot = (): number => {
  cleanOldRequests();
  if (rateLimiter.requests.length === 0) return 0;
  if (rateLimiter.requests.length < RAPID_API_LIMIT) return 0;
  
  const oldestRequest = Math.min(...rateLimiter.requests);
  return Math.max(0, oldestRequest + RAPID_API_WINDOW - Date.now());
};

// Process the request queue
const processQueue = async (): Promise<void> => {
  if (rateLimiter.processing) return;
  rateLimiter.processing = true;

  while (rateLimiter.queue.length > 0) {
    if (!canMakeRequest()) {
      const waitTime = getTimeUntilNextSlot();
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    const nextRequest = rateLimiter.queue.shift();
    if (nextRequest) {
      rateLimiter.requests.push(Date.now());
      
      try {
        await nextRequest();
      } catch (error) {
        console.error('Queue request failed:', error);
      }
    }
  }

  rateLimiter.processing = false;
};

// Queue a request with rate limiting
const queueRequest = <T>(fn: () => Promise<T>): Promise<T> => {
  return new Promise((resolve, reject) => {
    rateLimiter.queue.push(async () => {
      try {
        const result = await fn();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
    
    if (!rateLimiter.processing) {
      processQueue();
    }
  });
};

// Get cache key
const getCacheKey = (endpoint: string, params: Record<string, any> = {}): string => {
  return `${endpoint}:${JSON.stringify(params)}`;
};

// Main request function with rate limiting and caching
export const createRequest = async <T = any>(
  endpoint: string, 
  params: Record<string, any> = {}
): Promise<T> => {
  const cacheKey = getCacheKey(endpoint, params);
  const cached = rapidApiCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < RAPID_CACHE_TTL) {
    console.log(`🔄 Cache hit: ${endpoint}`);
    return cached.data as T;
  }
  
  console.log(`📡 API Request: ${endpoint} (queued)`);
  
  return queueRequest(async () => {
    try {
      const response = await axios.get(`https://${RAPID_API_HOST}${endpoint}`, {
        headers: {
          'x-rapidapi-host': RAPID_API_HOST,
          'x-rapidapi-key': RAPID_API_KEY!,
          'Accept': 'application/json'
        },
        params,
        timeout: 10000
      });
      
      if (response.data && response.data.status === 'success') {
        rapidApiCache.set(cacheKey, {
          data: response.data,
          timestamp: Date.now(),
          endpoint
        });
        // Store in global price store for live updates
        const coins = response.data.data.coins.map((coin: any) => ({
          symbol: coin.symbol,
          price: coin.price
        }));

globalPriceStore.updateFromCoinranking(coins);
        console.log(`✅ Request completed: ${endpoint} | Queue: ${rateLimiter.queue.length}`);
      }
      
      return response.data as T;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        
        if (axiosError.response?.status === 429) {
          console.warn(`⚠️ Rate limit hit for ${endpoint}, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
          return createRequest<T>(endpoint, params);
        }
        
        console.error('❌ RapidAPI Error:', {
          endpoint,
          params,
          error: axiosError.response?.data || axiosError.message,
          status: axiosError.response?.status
        });
      }
      
      throw error;
    }
  });
};

// Batch request helper
export const batchRequest = async <T>(
  requests: Array<{ coinId: string; endpoint: string; params?: Record<string, any> }>
): Promise<Record<string, T>> => {
  try {
    const results = await Promise.allSettled(
      requests.map(async (req) => {
        try {
          const data = await createRequest(req.endpoint, req.params);
          return { coinId: req.coinId, data };
        } catch (error) {
          return { coinId: req.coinId, error: error instanceof Error ? error.message : 'Unknown error' };
        }
      })
    );
    
    const batchResult: Record<string, T> = {};
    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value.coinId && !('error' in result.value)) {
        batchResult[result.value.coinId] = (result.value as any).data;
      }
    });
    
    return batchResult;
  } catch (error) {
    console.error('Batch request error:', error);
    throw error;
  }
};

// Get rate limiter stats
export const getRateLimiterStats = () => {
  cleanOldRequests();
  
  return {
    requestsThisMinute: rateLimiter.requests.length,
    queueLength: rateLimiter.queue.length,
    limit: RAPID_API_LIMIT,
    windowMs: RAPID_API_WINDOW,
    availableSlots: Math.max(0, RAPID_API_LIMIT - rateLimiter.requests.length),
    timeUntilNextSlot: getTimeUntilNextSlot()
  };
};

// Get cache stats
export const getCacheStats = () => ({
  size: rapidApiCache.size,
  ttl: RAPID_CACHE_TTL,
  keys: Array.from(rapidApiCache.keys()).slice(0, 10)
});

// Clear cache
export const clearCache = (): number => {
  const size = rapidApiCache.size;
  rapidApiCache.clear();
  return size;
};