// backend/utils/globalPriceStore.ts

export type SourceType = 'coinranking' | 'binance' | 'coinbase';

interface SourcePriority {
  [key: string]: number;
}

// Higher number = higher priority
let sourcePriority: SourcePriority = {
  coinranking: 1,
  coinbase: 2,
  binance: 3
};

export interface PriceSource {
  symbol: string;
  price: number;
  priceSource: SourceType;
  timestamp: number;

  // Metadata (never erased by price updates)
  marketCap?: number;
  uuid?: string;
  change24h?: number;
}

class GlobalPriceStore {
  private prices = new Map<string, PriceSource>();
  private listeners: Array<(prices: Map<string, PriceSource>) => void> = [];

  // Normalize symbol
  private normalize(symbol: string) {
    return symbol.toUpperCase();
  }

  // 🔥 Smart merge logic
  private mergePrice(
    symbolRaw: string,
    incoming: Partial<PriceSource>,
    source: SourceType
  ) {
    const symbol = this.normalize(symbolRaw);
    const existing = this.prices.get(symbol);

    const now = Date.now();

    // If no existing record → create new
    if (!existing) {
      this.prices.set(symbol, {
        symbol,
        price: incoming.price ?? 0,
        priceSource: source,
        timestamp: now,
        marketCap: incoming.marketCap,
        uuid: incoming.uuid,
        change24h: incoming.change24h
      });
      return;
    }

    const existingPriority = sourcePriority[existing.priceSource] ?? 0;
    const incomingPriority = sourcePriority[source] ?? 0;

    let newPrice = existing.price;
    let newSource = existing.priceSource;

    // Only override price if higher priority OR same priority but newer
    if (
      incoming.price !== undefined &&
      (
        incomingPriority > existingPriority ||
        (incomingPriority === existingPriority && now > existing.timestamp)
      )
    ) {
      newPrice = incoming.price;
      newSource = source;
    }

    this.prices.set(symbol, {
      symbol,
      price: newPrice,
      priceSource: newSource,
      timestamp: now,

      // 🔥 ALWAYS preserve metadata if incoming doesn't have it
      marketCap: incoming.marketCap ?? existing.marketCap,
      uuid: incoming.uuid ?? existing.uuid,
      change24h: incoming.change24h ?? existing.change24h
    });
  }

  // Coinranking (baseline metadata + fallback price)
  updateFromCoinranking(coins: Array<{
    symbol: string;
    price: string | number;
    marketCap?: string | number;
    uuid?: string;
    change?: string | number;
  }>) {
    coins.forEach(coin => {
      this.mergePrice(coin.symbol, {
        price: Number(coin.price),
        marketCap: coin.marketCap ? Number(coin.marketCap) : undefined,
        uuid: coin.uuid,
        change24h: coin.change ? Number(coin.change) : undefined
      }, 'coinranking');
    });

    this.notifyListeners();
  }

  // Binance (price authority)
  updateFromBinance(data: Array<{ symbol: string; price: number }>) {
    data.forEach(item => {
      this.mergePrice(item.symbol, {
        price: item.price
      }, 'binance');
    });

    this.notifyListeners();
  }

  // Coinbase (secondary price authority)
  updateFromCoinbase(data: Array<{
    symbol: string;
    price: number;
    marketCap?: number;
    change24h?: number;
  }>) {
    data.forEach(item => {
      this.mergePrice(item.symbol, {
        price: item.price,
        marketCap: item.marketCap,
        change24h: item.change24h
      }, 'coinbase');
    });

    this.notifyListeners();
  }

  getAllPrices(): PriceSource[] {
    return Array.from(this.prices.values())
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  // Future admin page can call this
  setSourcePriority(newPriority: SourcePriority) {
    sourcePriority = newPriority;
  }

  getStats() {
    const all = this.getAllPrices();

    const sources = {
      coinranking: all.filter(p => p.priceSource === 'coinranking').length,
      binance: all.filter(p => p.priceSource === 'binance').length,
      coinbase: all.filter(p => p.priceSource === 'coinbase').length
    };

    return {
      total: all.length,
      sources,
      priority: sourcePriority,
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