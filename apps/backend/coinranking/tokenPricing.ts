
import dotenv from 'dotenv';
dotenv.config();
import axios, { AxiosError } from 'axios';
import { globalPriceStore } from '../utils/globalPriceStore';

// RapidAPI CoinRanking configuration
const RAPID_API_HOST = process.env.RAPID_API_HOST || 'coinranking1.p.rapidapi.com';
const RAPID_API_KEY = process.env.RAPID_API_KEY;

// Rate limiting configuration
const RAPID_API_LIMIT = 50; // RapidAPI free tier: 50 requests per minute
const RAPID_API_WINDOW = 60 * 1000; // 1 minute in milliseconds
const MAX_RETRIES = 3;
const BASE_DELAY = 1000; // 1 second

// Cache configuration
const RAPID_CACHE_TTL = 30 * 1000; // 30 seconds

// Rate limiter state
interface RateLimiterState {
  requests: number[];
}

const rateLimiter: RateLimiterState = {
  requests: []
};

// Queue for requests
interface QueuedRequest {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  fn: () => Promise<any>;
  retryCount: number;
  endpoint: string;
}

const requestQueue: QueuedRequest[] = [];
let isProcessing = false;

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
  if (isProcessing || requestQueue.length === 0) return;
  isProcessing = true;

  while (requestQueue.length > 0) {
    // Check if we can make a request
    if (!canMakeRequest()) {
      const waitTime = getTimeUntilNextSlot();
      console.log(`⏳ Rate limit reached, waiting ${Math.ceil(waitTime / 1000)}s...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    const request = requestQueue.shift();
    if (!request) continue;

    // Record this request
    rateLimiter.requests.push(Date.now());

    try {
      const result = await request.fn();
      request.resolve(result);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        
        // Handle rate limiting with retry
        if (axiosError.response?.status === 429 && request.retryCount < MAX_RETRIES) {
          const delay = BASE_DELAY * Math.pow(2, request.retryCount);
          console.log(`⚠️ Rate limited for ${request.endpoint}, retry ${request.retryCount + 1}/${MAX_RETRIES} in ${delay}ms`);
          
          // Re-queue with incremented retry count after delay
          setTimeout(() => {
            requestQueue.push({
              ...request,
              retryCount: request.retryCount + 1
            });
          }, delay);
        } else {
          console.error('❌ Request failed:', {
            endpoint: request.endpoint,
            status: axiosError.response?.status,
            message: axiosError.message
          });
          request.reject(error);
        }
      } else {
        request.reject(error);
      }
    }
  }

  isProcessing = false;
};

// Queue a request with rate limiting
const queueRequest = <T>(endpoint: string, fn: () => Promise<T>): Promise<T> => {
  return new Promise((resolve, reject) => {
    requestQueue.push({
      resolve,
      reject,
      fn,
      retryCount: 0,
      endpoint
    });
    
    if (!isProcessing) {
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
  
  // Return cached response if valid
  if (cached && Date.now() - cached.timestamp < RAPID_CACHE_TTL) {
    console.log(`🔄 Cache hit: ${endpoint}`);
    return cached.data as T;
  }
  
  console.log(`📡 Queueing request: ${endpoint}`);
  
  return queueRequest(endpoint, async () => {
    try {
      const response = await axios.get(`https://${RAPID_API_HOST}${endpoint}`, {
        headers: {
          'x-rapidapi-host': RAPID_API_HOST,
          'x-rapidapi-key': RAPID_API_KEY!,
          'Accept': 'application/json'
        },
        params,
      });
      
      if (response.data && response.data.status === 'success') {
        // Cache the response
        rapidApiCache.set(cacheKey, {
          data: response.data,
          timestamp: Date.now(),
          endpoint
        });

        // Update global store with coin data (only for /coins endpoint)
        if (endpoint === '/coins') {
          try {
            const coins = response.data.data.coins.map((coin: any) => ({
              symbol: coin.symbol,
              price: parseFloat(coin.price),
              marketCap: coin.marketCap !== undefined ? parseFloat(coin.marketCap) : undefined,
              uuid: coin.uuid,
              change: coin.change !== undefined ? parseFloat(coin.change) : undefined
            }));
            globalPriceStore.updateFromCoinranking(coins);
            console.log(`📤 Updated global store with ${coins.length} coins`);
          } catch (storeError) {
            console.error('Error updating global store:', storeError);
          }
        }
        
        console.log(`✅ Request completed: ${endpoint} | Queue: ${requestQueue.length}`);
      }
      
      return response.data as T;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        
        // Log all errors except 429 (which is handled by queue)
        if (axiosError.response?.status !== 429) {
          console.error('❌ RapidAPI Error:', {
            endpoint,
            params,
            status: axiosError.response?.status,
            statusText: axiosError.response?.statusText,
            data: axiosError.response?.data,
            message: axiosError.message
          });
        }
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
    queueLength: requestQueue.length,
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