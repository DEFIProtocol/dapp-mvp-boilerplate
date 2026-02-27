import WebSocket from 'ws';
import axios from 'axios';
import { 
  binanceLimiter, 
  normalizeSymbol, 
  createTradingPair, 
  priceCache,
} from '../utils/exchangeUtils';
import { globalPriceStore } from '../utils/globalPriceStore';

// Binance API configuration
const BINANCE_BASE_URL = 'https://api.binance.us/api/v3';
const BINANCE_WS_URL = 'wss://stream.binance.us:9443/ws';

// Types
interface BinancePriceResponse {
  symbol: string;
  price: string;
}

interface BinanceTickerData {
  c: string; // Current price
  s: string; // Symbol
}

export interface TokenPrice {
  symbol: string;
  price: number;
  source: string;
  lastUpdated: number;
  pair: string;
}

// Store for all token prices
const tokenPriceStore = new Map<string, TokenPrice>();

// Track WebSocket connections
const wsConnections = new Map<string, WebSocket>();

// In initializeTokenPrices(), after populating tokenPriceStore, add:

export const initializeTokenPrices = async (): Promise<void> => {
  try {
    console.log('📊 Initializing all token prices from Binance...');
    await binanceLimiter.waitIfNeeded();

    const response = await axios.get<BinancePriceResponse[]>(`${BINANCE_BASE_URL}/ticker/price`);
    const list = Array.isArray(response.data) ? response.data : [];
    
    const allPrices: Array<{ symbol: string; price: number }> = []; // Add this
    
    for (const item of list) {
      const symbolPair = item?.symbol;
      if (!symbolPair || !symbolPair.endsWith('USDT')) continue;
      
      const base = symbolPair.replace(/USDT$/, '');
      const price = parseFloat(item.price);
      
      // Store in both cache and our token store
      priceCache.set(base, price, 'binance');
      tokenPriceStore.set(base, {
        symbol: base,
        price,
        source: 'binance',
        lastUpdated: Date.now(),
        pair: symbolPair
      });
      
      allPrices.push({ symbol: base, price }); // Add this
    }
    
    console.log(`✅ Initialized ${tokenPriceStore.size} token prices`);
    
    // 🔥 Send initial batch to global store
    if (allPrices.length > 0) {
      globalPriceStore.updateFromBinance(allPrices);
      console.log(`📤 Sent ${allPrices.length} Binance prices to global store`);
    }
    
    // After initialization, connect WebSockets for top symbols
    connectWebSocketsForTopTokens();
  } catch (error) {
    console.error('Failed to initialize token prices:', error);
  }
};

// Connect WebSockets for top 50 tokens by default
const connectWebSocketsForTopTokens = (count: number = 50): void => {
  const tokens = Array.from(tokenPriceStore.keys()).slice(0, count);
  console.log(`🔌 Setting up WebSockets for top ${tokens.length} tokens...`);
  tokens.forEach(symbol => setupBinanceWebSocket(symbol));
};

// Setup WebSocket for a symbol
const setupBinanceWebSocket = (symbol: string): void => {
  try {
    const normalizedSymbol = normalizeSymbol(symbol);
    const tradingPair = `${normalizedSymbol.toLowerCase()}usdt@ticker`;
    
    if (wsConnections.has(normalizedSymbol)) return;
    
    const ws = new WebSocket(`${BINANCE_WS_URL}/${tradingPair}`);
    
    ws.on('open', () => {
      console.log(`✅ WebSocket connected: ${normalizedSymbol}`);
    });

ws.on('message', (data: WebSocket.Data) => {
  try {
    const message = JSON.parse(data.toString());
    
    // Check if it's a single ticker or array
    if (Array.isArray(message)) {
      // Binance streams multiple tickers in one message
      const updates = message.map((ticker: any) => ({
        symbol: ticker.s.replace('USDT', ''), // Convert BTCUSDT -> BTC
        price: parseFloat(ticker.c)
      }));
      
      // Update global store with ALL binance prices at once
      globalPriceStore.updateFromBinance(updates);
      console.log(`📡 Binance WS: Updated ${updates.length} prices`);
    } else if (message.c) {
      // Single ticker message
      const symbol = message.s.replace('USDT', '');
      const price = parseFloat(message.c);
      
      globalPriceStore.updateFromBinance([{
        symbol,
        price
      }]);
    }
  } catch (error) {
    console.error('WebSocket parse error:', error);
  }
});
    ws.on('error', () => {
      // Silent fail - will reconnect on close
    });
    
    ws.on('close', () => {
      wsConnections.delete(normalizedSymbol);
      // Attempt reconnect after delay
      setTimeout(() => {
        if (!wsConnections.has(normalizedSymbol)) {
          setupBinanceWebSocket(normalizedSymbol);
        }
      }, 10000);
    });
    
    wsConnections.set(normalizedSymbol, ws);
  } catch (error) {
    // Silent fail
  }
};

// Get all token prices (the only endpoint you need!)
export const getAllTokenPrices = (): TokenPrice[] => {
  return Array.from(tokenPriceStore.values()).sort((a, b) => a.symbol.localeCompare(b.symbol));
};

// Optional: Refresh all prices periodically (keeps WebSocket-disconnected tokens updated)
export const startPeriodicRefresh = (intervalMs: number = 5 * 60 * 1000): void => {
  setInterval(async () => {
    try {
      await binanceLimiter.waitIfNeeded();
      const response = await axios.get<BinancePriceResponse[]>(`${BINANCE_BASE_URL}/ticker/price`);
      const list = Array.isArray(response.data) ? response.data : [];
      
      for (const item of list) {
        const symbolPair = item?.symbol;
        if (!symbolPair || !symbolPair.endsWith('USDT')) continue;
        
        const base = symbolPair.replace(/USDT$/, '');
        const price = parseFloat(item.price);
        
        // Only update if token exists in our store (don't add new ones)
        const existing = tokenPriceStore.get(base);
        if (existing && existing.source !== 'binance-ws') {
          tokenPriceStore.set(base, {
            ...existing,
            price,
            lastUpdated: Date.now(),
            source: 'binance-refresh'
          });
          priceCache.set(base, price, 'binance-refresh');
        }
      }
      console.log(`✅ Periodic refresh completed`);
    } catch (error) {
      // Silent fail
    }
  }, intervalMs);
};
