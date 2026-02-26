// shared/utils/exchangeUtils.ts

const sleep = (ms: number): Promise<void> => 
  new Promise((resolve) => setTimeout(resolve, ms));

interface Limiter {
  waitIfNeeded: () => Promise<void>;
}

const createLimiter = (minIntervalMs: number = 200): Limiter => {
  let lastCall = 0;

  return {
    waitIfNeeded: async (): Promise<void> => {
      const now = Date.now();
      const wait = Math.max(0, minIntervalMs - (now - lastCall));
      if (wait > 0) {
        await sleep(wait);
      }
      lastCall = Date.now();
    }
  };
};

const normalizeSymbol = (symbol: string = ''): string => {
  return symbol
    .toString()
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
};

const createTradingPair = (symbol: string, quote: string = 'USDT'): string => {
  const base = normalizeSymbol(symbol);
  const q = normalizeSymbol(quote);
  return `${base}${q}`;
};

// Cache entry type
interface CacheEntry {
  price: number;
  source: string;
  timestamp: number;
}

// Cache map
const cacheMap = new Map<string, CacheEntry>();

// Price cache with listeners
interface PriceCache {
  listeners: Record<string, Array<(entry: CacheEntry) => void>>;
  get: (symbol: string) => CacheEntry | undefined;
  set: (symbol: string, price: number, source?: string) => CacheEntry;
  delete: (symbol: string) => boolean;
  clear: () => void;
}

const priceCache: PriceCache = {
  listeners: {},
  
  get: (symbol: string): CacheEntry | undefined => {
    const key = normalizeSymbol(symbol);
    return cacheMap.get(key);
  },
  
  set: (symbol: string, price: number, source: string = 'unknown'): CacheEntry => {
    const key = normalizeSymbol(symbol);
    const entry = {
      price,
      source,
      timestamp: Date.now()
    };
    cacheMap.set(key, entry);

    // Notify listeners
    if (priceCache.listeners[key]) {
      priceCache.listeners[key].forEach((callback) => callback(entry));
    }

    return entry;
  },
  
  delete: (symbol: string): boolean => {
    const key = normalizeSymbol(symbol);
    return cacheMap.delete(key);
  },
  
  clear: (): void => {
    cacheMap.clear();
  }
};

// Rate limiters with exchange-specific intervals
const binanceLimiter = createLimiter(100);  // 10 requests per second
const coinbaseLimiter = createLimiter(200); // 5 requests per second
const krakenLimiter = createLimiter(200);   // 5 requests per second

export {
  binanceLimiter,
  coinbaseLimiter,
  krakenLimiter,
  normalizeSymbol,
  createTradingPair,
  priceCache,
  type CacheEntry,
  type Limiter
};