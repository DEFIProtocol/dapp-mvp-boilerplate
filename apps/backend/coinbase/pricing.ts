import WebSocket from 'ws';
import axios from 'axios';
import crypto from 'crypto';
import { 
  coinbaseLimiter, 
  normalizeSymbol, 
  createTradingPair, 
  priceCache,
} from '../utils/exchangeUtils';
import { globalPriceStore } from '../utils/globalPriceStore';

// Coinbase API configuration
const COINBASE_API_KEY = process.env.COINBASE_API_KEY || '';
const COINBASE_API_SECRET = process.env.COINBASE_API_SECRET || '';
const COINBASE_BASE_URL = 'https://api.exchange.coinbase.com';
const COINBASE_WS_URL = 'wss://ws-feed.exchange.coinbase.com';

// Types
interface CoinbaseProduct {
  id: string;
  base_currency: string;
  quote_currency: string;
  base_increment: string;
  quote_increment: string;
  display_name: string;
  status: string;
  trading_disabled: boolean;
}

interface CoinbaseTicker {
  product_id: string;
  price: string;
  volume_24h: string;
  low_24h: string;
  high_24h: string;
  open_24h: string;
  best_bid: string;
  best_ask: string;
  time: string;
}

interface CoinbaseWsTicker {
  type: 'ticker';
  product_id: string;
  price: string;
  volume_24h: string;
  low_24h: string;
  high_24h: string;
  open_24h: string;
  best_bid: string;
  best_ask: string;
  time: string;
}

export interface TokenPrice {
  symbol: string;
  price: number;
  source: string;
  lastUpdated: number;
  pair: string;
  volume24h?: string;
  change24h?: string;
}

// Store for all token prices
const tokenPriceStore = new Map<string, TokenPrice>();

// WebSocket connection
let coinbaseWs: WebSocket | null = null;
let wsReconnectTimer: NodeJS.Timeout | null = null;

// Generate Coinbase signature
const generateSignature = (timestamp: string, method: string, requestPath: string, body: string = ''): string => {
  const message = timestamp + method + requestPath + body;
  const key = Buffer.from(COINBASE_API_SECRET, 'base64');
  const hmac = crypto.createHmac('sha256', key);
  return hmac.update(message).digest('base64');
};

// Calculate 24h change percentage
const calculate24hChange = (ticker: CoinbaseTicker): string => {
  const open = parseFloat(ticker.open_24h);
  const current = parseFloat(ticker.price);
  if (!open || !current) return '0';
  return ((current - open) / open * 100).toFixed(2);
};

// Calculate 24h change from WebSocket message
const calculateWs24hChange = (message: CoinbaseWsTicker, existing: TokenPrice): string => {
  if (message.open_24h) {
    const open = parseFloat(message.open_24h);
    const current = parseFloat(message.price);
    return ((current - open) / open * 100).toFixed(2);
  }
  return existing.change24h || '0';
};

// Initialize with all prices from REST
export const initializeTokenPrices = async (): Promise<void> => {
  try {
    console.log('📊 Initializing all token prices from Coinbase...');
    await coinbaseLimiter.waitIfNeeded();

    // First, get all available products
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const requestPath = '/products';
    const signature = generateSignature(timestamp, 'GET', requestPath);

    const productsResponse = await axios.get<CoinbaseProduct[]>(`${COINBASE_BASE_URL}${requestPath}`, {
      headers: {
        'CB-ACCESS-KEY': COINBASE_API_KEY,
        'CB-ACCESS-SIGN': signature,
        'CB-ACCESS-TIMESTAMP': timestamp,
        'Content-Type': 'application/json'
      }
    });

    // Filter for USD pairs and active trading
    const usdPairs = productsResponse.data.filter(
      p => p.quote_currency === 'USD' && !p.trading_disabled && p.status === 'online'
    );

    console.log(`📊 Found ${usdPairs.length} USD trading pairs on Coinbase`);

    // Fetch ticker for each product (in batches to avoid rate limits)
    const batchSize = 10;
    // We'll try to get marketCap and change24h from coinranking if available
    const allPrices: Array<{ symbol: string; price: number; marketCap?: number; change24h?: number }> = [];
    
    for (let i = 0; i < usdPairs.length; i += batchSize) {
      const batch = usdPairs.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (product) => {
        try {
          await coinbaseLimiter.waitIfNeeded();
          
          const tickerResponse = await axios.get<CoinbaseTicker>(
            `${COINBASE_BASE_URL}/products/${product.id}/ticker`
          );
          
          const baseSymbol = product.base_currency;
          const price = parseFloat(tickerResponse.data.price);
          
          // Try to get marketCap and change24h from coinranking global store if available
          let marketCap: number | undefined = undefined;
          let change24h: number | undefined = undefined;
          const coinranking = globalPriceStore.getAllPrices().find(p => p.symbol === baseSymbol && p.source === 'coinranking');
          if (coinranking) {
            marketCap = coinranking.marketCap;
            change24h = coinranking.change24h;
          }
          // Use coinbase's own 24h change if available
          const cbChange = calculate24hChange(tickerResponse.data);
          if (cbChange && !isNaN(Number(cbChange))) change24h = Number(cbChange);

          // Store in local token store
          tokenPriceStore.set(baseSymbol, {
            symbol: baseSymbol,
            price,
            source: 'coinbase',
            lastUpdated: Date.now(),
            pair: product.id,
            volume24h: tickerResponse.data.volume_24h,
            change24h: cbChange
          });
          
          // Update price cache
          priceCache.set(baseSymbol, price, 'coinbase');
          
          // Add to batch for global store
          allPrices.push({ symbol: baseSymbol, price, marketCap, change24h });
          
        } catch (error) {
          // Skip failed fetches
        }
      }));
      
      // Small delay between batches
      if (i + batchSize < usdPairs.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log(`✅ Initialized ${tokenPriceStore.size} token prices from Coinbase`);
    
    // 🔥 Send ALL initialized prices to global store
    if (allPrices.length > 0) {
      globalPriceStore.updateFromCoinbase(allPrices);
      console.log(`📤 Sent ${allPrices.length} Coinbase prices to global store`);
    }
    
    // After initialization, setup WebSocket
    setupCoinbaseWebSocket();
  } catch (error) {
    console.error('Failed to initialize Coinbase token prices:', error);
  }
};

// Setup Coinbase WebSocket
const setupCoinbaseWebSocket = (): void => {
  if (coinbaseWs) {
    coinbaseWs.close();
  }

  console.log('🔌 Setting up Coinbase WebSocket connection...');
  coinbaseWs = new WebSocket(COINBASE_WS_URL);

  coinbaseWs.on('open', () => {
    console.log('✅ Coinbase WebSocket connected');
    
    // Subscribe to all tokens we have in store
    const symbols = Array.from(tokenPriceStore.keys());
    const subscribeMessage = {
      type: 'subscribe',
      product_ids: symbols.map(s => `${s}-USD`),
      channels: ['ticker']
    };
    
    coinbaseWs?.send(JSON.stringify(subscribeMessage));
    console.log(`📡 Subscribed to ${symbols.length} Coinbase products`);
  });

  coinbaseWs.on('message', (data: WebSocket.Data) => {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'ticker' && message.product_id) {
        const symbol = message.product_id.replace('-USD', '');
        const price = parseFloat(message.price);
        
        // Update token store
        const existing = tokenPriceStore.get(symbol);
        if (existing) {
          tokenPriceStore.set(symbol, {
            ...existing,
            price,
            source: 'coinbase-ws',
            lastUpdated: Date.now(),
            volume24h: message.volume_24h || existing.volume24h,
            change24h: calculateWs24hChange(message, existing)
          });
        }
        
        // Update price cache
        priceCache.set(symbol, price, 'coinbase-ws');
        
        // 🔥 Send REAL-TIME update to global store
        // Try to get marketCap and change24h from coinranking global store if available
        let marketCap: number | undefined = undefined;
        let change24h: number | undefined = undefined;
        const coinranking = globalPriceStore.getAllPrices().find(p => p.symbol === symbol && p.source === 'coinranking');
        if (coinranking) {
          marketCap = coinranking.marketCap;
          change24h = coinranking.change24h;
        }
        // Use coinbase's own 24h change if available
        const cbChange = calculateWs24hChange(message, existing!);
        if (cbChange && !isNaN(Number(cbChange))) change24h = Number(cbChange);
        globalPriceStore.updateFromCoinbase([{
          symbol,
          price,
          marketCap,
          change24h
        }]);
      }
    } catch (error) {
      // Silent fail for parse errors
    }
  });

  coinbaseWs.on('error', (error) => {
    console.error('❌ Coinbase WebSocket error:', error.message);
  });

  coinbaseWs.on('close', () => {
    console.log('🔌 Coinbase WebSocket closed');
    
    // Clear any existing reconnect timer
    if (wsReconnectTimer) {
      clearTimeout(wsReconnectTimer);
    }
    
    // Attempt reconnect after delay
    wsReconnectTimer = setTimeout(() => {
      console.log('🔄 Attempting to reconnect Coinbase WebSocket...');
      setupCoinbaseWebSocket();
    }, 10000);
  });
};

// Get all token prices
export const getAllTokenPrices = (): TokenPrice[] => {
  return Array.from(tokenPriceStore.values()).sort((a, b) => a.symbol.localeCompare(b.symbol));
};

// Optional: Periodic refresh for tokens not getting WebSocket updates
export const startPeriodicRefresh = (intervalMs: number = 15 * 60 * 1000): void => {
  setInterval(async () => {
    console.log('🔄 Periodic refresh of Coinbase prices...');
    
    const tokens = Array.from(tokenPriceStore.values());
    const batchSize = 5;
    const refreshedPrices: Array<{ symbol: string; price: number }> = [];
    
    for (let i = 0; i < tokens.length; i += batchSize) {
      const batch = tokens.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (token) => {
        try {
          await coinbaseLimiter.waitIfNeeded();
          
          const response = await axios.get<CoinbaseTicker>(
            `${COINBASE_BASE_URL}/products/${token.pair}/ticker`
          );
          
          const price = parseFloat(response.data.price);
          
          // Only update if not getting WebSocket updates
          if (token.source !== 'coinbase-ws') {
            tokenPriceStore.set(token.symbol, {
              ...token,
              price,
              source: 'coinbase-refresh',
              lastUpdated: Date.now(),
              volume24h: response.data.volume_24h,
              change24h: calculate24hChange(response.data)
            });
            priceCache.set(token.symbol, price, 'coinbase-refresh');
            
            // Add to refreshed prices for global store
            refreshedPrices.push({ symbol: token.symbol, price });
          }
        } catch (error) {
          // Skip failed refreshes
        }
      }));
      
      if (i + batchSize < tokens.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // 🔥 Send refreshed prices to global store
    if (refreshedPrices.length > 0) {
      globalPriceStore.updateFromCoinbase(refreshedPrices);
      console.log(`📤 Sent ${refreshedPrices.length} refreshed prices to global store`);
    }
    
    console.log('✅ Periodic refresh completed');
  }, intervalMs);
};