// backend/oneinch/tokenPricing.ts

import axios from 'axios';

// 1inch API configuration
const ONEINCH_TOKEN_BASE_URL = 'https://api.1inch.com/token';
const ONEINCH_API_KEY = process.env.ONEINCH_API_KEY || '';

// Cache for token data
interface TokenCacheEntry {
  data: any;
  timestamp: number;
  chainId: number;
}

const tokenCache = new Map<string, TokenCacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Fetch tokens from 1inch
export const fetchOneInchTokens = async (
  chainId: number = 1,
  provider: string = '1inch'
): Promise<any> => {
  const cacheKey = `${chainId}:${provider}`;
  const cached = tokenCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const url = `${ONEINCH_TOKEN_BASE_URL}/v1.2/${chainId}`;
  
  try {
    const response = await axios.get(url, {
      headers: ONEINCH_API_KEY
        ? { Authorization: `Bearer ${ONEINCH_API_KEY}`, Accept: 'application/json' }
        : { Accept: 'application/json' },
      params: { provider }
    });

    tokenCache.set(cacheKey, {
      data: response.data,
      timestamp: Date.now(),
      chainId
    });

    return response.data;
  } catch (error) {
    console.error(`❌ 1inch API error for chain ${chainId}:`, error);
    throw error;
  }
};