// backend/pyth/pythService.ts
import axios from 'axios';
import NodeCache from 'node-cache';
import { PythPriceResponse, PythPriceFeed, PYTH_PRICE_FEEDS } from './types/pyth';

export class PythService {
  private cache: NodeCache;
  private readonly HERMES_URL = 'https://hermes.pyth.network';
  private readonly HERMES_FALLBACK_URL = 'https://xc-testnet.pyth.network'; // Fallback endpoint

  constructor() {
    this.cache = new NodeCache({ 
      stdTTL: 15, // 15 seconds default TTL
      checkperiod: 5 
    });
  }

  /**
   * Get latest price for a specific price feed ID
   */
  async getPrice(feedId: string): Promise<PythPriceFeed | null> {
    const cacheKey = `price:${feedId}`;
    const cached = this.cache.get<PythPriceFeed>(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get<PythPriceResponse>(
        `${this.HERMES_URL}/v2/updates/price/latest`, {
          params: {
            'ids[]': feedId,
            'parsed': true
          },
          timeout: 5000
        }
      );

      if (response.data.parsed && response.data.parsed.length > 0) {
        const priceFeed = response.data.parsed[0];
        this.cache.set(cacheKey, priceFeed, 5); // Cache for 5 seconds
        return priceFeed;
      }
      return null;
    } catch (error) {
      console.error(`Error fetching price for feed ${feedId}:`, error);
      return this.getPriceFallback(feedId);
    }
  }

  /**
   * Fallback method if primary endpoint fails
   */
  private async getPriceFallback(feedId: string): Promise<PythPriceFeed | null> {
    try {
      const response = await axios.get<PythPriceResponse>(
        `${this.HERMES_FALLBACK_URL}/api/latest_price_feeds`, {
          params: {
            'ids[]': feedId
          },
          timeout: 5000
        }
      );

      if (response.data.parsed && response.data.parsed.length > 0) {
        return response.data.parsed[0];
      }
      return null;
    } catch (error) {
      console.error(`Error fetching price from fallback for feed ${feedId}:`, error);
      return null;
    }
  }

  /**
   * Get latest prices for multiple price feed IDs
   */
  async getBatchPrices(feedIds: string[]): Promise<Map<string, PythPriceFeed>> {
    const results = new Map<string, PythPriceFeed>();
    const uncachedIds: string[] = [];

    // Check cache first
    for (const id of feedIds) {
      const cacheKey = `price:${id}`;
      const cached = this.cache.get<PythPriceFeed>(cacheKey);
      if (cached) {
        results.set(id, cached);
      } else {
        uncachedIds.push(id);
      }
    }

    if (uncachedIds.length === 0) return results;

    try {
      const response = await axios.get<PythPriceResponse>(
        `${this.HERMES_URL}/v2/updates/price/latest`, {
          params: {
            'ids[]': uncachedIds,
            'parsed': true
          },
          timeout: 5000
        }
      );

      if (response.data.parsed) {
        response.data.parsed.forEach(priceFeed => {
          const id = priceFeed.id;
          results.set(id, priceFeed);
          this.cache.set(`price:${id}`, priceFeed, 5);
        });
      }
    } catch (error) {
      console.error('Error fetching batch prices:', error);
    }

    return results;
  }

  /**
   * Get price by asset symbol and chain
   */
  async getPriceBySymbol(chain: string, symbol: string): Promise<PythPriceFeed | null> {
    const chainFeeds = PYTH_PRICE_FEEDS[chain.toLowerCase()];
    if (!chainFeeds) {
      throw new Error(`Unsupported chain: ${chain}`);
    }

    const feedId = chainFeeds[symbol.toLowerCase()];
    if (!feedId) {
      throw new Error(`Unsupported symbol ${symbol} on chain ${chain}`);
    }

    return this.getPrice(feedId);
  }

  /**
   * Get EMA price for funding rate calculations
   * Note: EMA price is already included in the price feed response
   */
  async getEMAPrice(feedId: string): Promise<number | null> {
    const priceFeed = await this.getPrice(feedId);
    if (!priceFeed || !priceFeed.ema_price) return null;

    const { price, expo } = priceFeed.ema_price;
    return price * Math.pow(10, expo);
  }

  /**
   * Get price with confidence interval for risk management
   */
  async getPriceWithConfidence(feedId: string): Promise<{
    price: number;
    confidence: number;
    timestamp: number;
  } | null> {
    const priceFeed = await this.getPrice(feedId);
    if (!priceFeed || !priceFeed.price) return null;

    const { price, conf, expo, publishTime } = priceFeed.price;
    return {
      price: price * Math.pow(10, expo),
      confidence: conf * Math.pow(10, expo),
      timestamp: publishTime * 1000 // Convert to milliseconds
    };
  }

  /**
   * Get price feed metadata (for available feeds)
   */
  async getPriceFeedMetadata(): Promise<any> {
    try {
      const response = await axios.get(`${this.HERMES_URL}/v2/price_feeds`);
      return response.data;
    } catch (error) {
      console.error('Error fetching price feed metadata:', error);
      return [];
    }
  }

  /**
   * Get historical prices for a feed (last 24 hours)
   */
  async getHistoricalPrices(feedId: string, hours: number = 24): Promise<PythPriceFeed[]> {
    const cacheKey = `historical:${feedId}:${hours}`;
    const cached = this.cache.get<PythPriceFeed[]>(cacheKey);
    if (cached) return cached;

    try {
      const now = Math.floor(Date.now() / 1000);
      const from = now - (hours * 3600);

      const response = await axios.get<PythPriceResponse>(
        `${this.HERMES_URL}/v2/updates/price/${feedId}`, {
          params: {
            from,
            to: now,
            parsed: true
          },
          timeout: 10000
        }
      );

      if (response.data.parsed) {
        this.cache.set(cacheKey, response.data.parsed, 300); // Cache for 5 minutes
        return response.data.parsed;
      }
      return [];
    } catch (error) {
      console.error('Error fetching historical prices:', error);
      return [];
    }
  }

  /**
   * Calculate funding rate suggestion based on price vs EMA
   */
  calculateFundingRate(spotPrice: number, emaPrice: number): number {
    if (spotPrice === 0 || emaPrice === 0) return 0;
    
    // Simple funding rate calculation based on price deviation
    const deviation = (spotPrice - emaPrice) / emaPrice;
    
    // Max funding rate of 0.1% per hour (2.4% per day)
    const maxFundingRate = 0.001; // 0.1%
    
    // Calculate funding rate with dampening
    let fundingRate = deviation * 0.5; // 50% of deviation
    
    // Cap the funding rate
    fundingRate = Math.max(-maxFundingRate, Math.min(maxFundingRate, fundingRate));
    
    return fundingRate;
  }

  /**
   * Get all available feeds for a chain
   */
  getAvailableFeeds(chain: string): string[] {
    const chainFeeds = PYTH_PRICE_FEEDS[chain.toLowerCase()];
    return chainFeeds ? Object.keys(chainFeeds) : [];
  }
}