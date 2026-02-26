// backend/utils/globalPriceStore.ts

export interface PriceSource {
  symbol: string;
  price: number;
  source: 'coinranking' | 'binance' | 'coinbase' | string;
  timestamp: number;
  pair?: string;
}

class GlobalPriceStore {
  private prices = new Map<string, PriceSource>();
  private listeners: Array<(prices: Map<string, PriceSource>) => void> = [];

  // 1. Coinranking sets the baseline (all tokens)
  updateFromCoinranking(coins: Array<{ symbol: string; price: string | number }>) {
    let count = 0;
    
    coins.forEach(coin => {
      const symbol = coin.symbol.toUpperCase();
      const price = typeof coin.price === 'string' ? parseFloat(coin.price) : coin.price;
      
      // Only set if not already overridden by higher priority source
      if (!this.prices.has(symbol) || this.prices.get(symbol)?.source === 'coinranking') {
        this.prices.set(symbol, {
          symbol,
          price,
          source: 'coinranking',
          timestamp: Date.now()
        });
        count++;
      }
    });
    
    console.log(`✅ Coinranking base set: ${count} tokens`);
    this.notifyListeners();
  }

  // 2. Binance overrides (higher priority)
  updateFromBinance(binanceData: Array<{ symbol: string; price: number }>) {
    let overrides = 0;
    
    binanceData.forEach(item => {
      const symbol = item.symbol; // Already normalized
      
      this.prices.set(symbol, {
        symbol,
        price: item.price,
        source: 'binance',
        timestamp: Date.now()
      });
      overrides++;
    });
    
    console.log(`🔄 Binance overrides: ${overrides} tokens`);
    this.notifyListeners();
  }

  // 3. Coinbase overrides (only if not already in Binance)
  updateFromCoinbase(coinbaseData: Array<{ symbol: string; price: number }>) {
    let overrides = 0;
    
    coinbaseData.forEach(item => {
      const symbol = item.symbol;
      
      // Only override if not already set by Binance
      if (!this.prices.has(symbol) || this.prices.get(symbol)?.source !== 'binance') {
        this.prices.set(symbol, {
          symbol,
          price: item.price,
          source: 'coinbase',
          timestamp: Date.now()
        });
        overrides++;
      }
    });
    
    console.log(`🔄 Coinbase overrides: ${overrides} tokens`);
    this.notifyListeners();
  }

  // Get all prices with source hierarchy preserved
  getAllPrices(): PriceSource[] {
    return Array.from(this.prices.values())
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  // Get stats about sources
  getStats() {
    const all = this.getAllPrices();
    const sources = {
      coinranking: all.filter(p => p.source === 'coinranking').length,
      binance: all.filter(p => p.source === 'binance').length,
      coinbase: all.filter(p => p.source === 'coinbase').length
    };
    
    return {
      total: all.length,
      sources,
      timestamp: Date.now()
    };
  }

  private notifyListeners() {
    this.listeners.forEach(cb => cb(this.prices));
  }

  subscribe(callback: (prices: Map<string, PriceSource>) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }
}

export const globalPriceStore = new GlobalPriceStore();