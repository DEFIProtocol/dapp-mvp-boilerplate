import { normalizeSymbol } from './exchangeUtils';

export type SourceType = 'coinranking' | 'binance' | 'coinbase';

interface SourcePriority {
  [key: string]: number;
}

let sourcePriority: SourcePriority = {
  coinranking: 1,
  coinbase: 2,
  binance: 3,
};

const metadataPriority: SourcePriority = {
  coinranking: 1,
  coinbase: 2,
  binance: 0,
};

export interface PriceSource {
  symbol: string;
  price: number;
  priceSource: SourceType;
  timestamp: number;
  marketCap?: number;
  uuid?: string;
  change24h?: number;
}

class GlobalPriceStore {
  private prices = new Map<string, PriceSource>();
  private listeners: Array<(prices: Map<string, PriceSource>) => void> = [];
  private metadataSource = new Map<string, SourceType>();

  private toFinite(value: unknown): number | undefined {
    if (value === null || value === undefined) return undefined;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : undefined;
  }

  private pairMetadata(
    marketCap: number | undefined,
    change24h: number | undefined
  ): { marketCap: number | undefined; change24h: number | undefined } {
    const hasCap = marketCap !== undefined;
    const hasChange = change24h !== undefined;
    if (hasCap && hasChange) return { marketCap, change24h };
    return { marketCap: undefined, change24h: undefined };
  }

  private resolveMetadata(
    symbol: string,
    existing: PriceSource | undefined,
    source: SourceType,
    incoming: Partial<PriceSource>
  ): { marketCap: number | undefined; change24h: number | undefined } {
    const existingPair = this.pairMetadata(
      this.toFinite(existing?.marketCap),
      this.toFinite(existing?.change24h)
    );

    if (source === 'binance') {
      return existingPair;
    }

    const incomingPair = this.pairMetadata(
      this.toFinite(incoming.marketCap),
      this.toFinite(incoming.change24h)
    );

    const hasIncomingPair = incomingPair.marketCap !== undefined;
    const existingSource = this.metadataSource.get(symbol);
    const existingPriority = existingSource ? metadataPriority[existingSource] ?? 0 : -1;
    const incomingPriority = metadataPriority[source] ?? 0;

    if (hasIncomingPair && incomingPriority >= existingPriority) {
      this.metadataSource.set(symbol, source);
      return incomingPair;
    }

    return existingPair;
  }

  private mergePrice(
    symbolRaw: string,
    incoming: Partial<PriceSource>,
    source: SourceType
  ) {
    const symbol = normalizeSymbol(symbolRaw);
    const existing = this.prices.get(symbol);
    const now = Date.now();

    const incomingPrice = this.toFinite(incoming.price);

    if (!existing) {
      const initialPrice = incomingPrice ?? 0;
      const metadata = this.resolveMetadata(symbol, undefined, source, incoming);

      if (metadata.marketCap !== undefined) {
        this.metadataSource.set(symbol, source);
      }

      this.prices.set(symbol, {
        symbol,
        price: initialPrice,
        priceSource: source,
        timestamp: now,
        marketCap: metadata.marketCap,
        change24h: metadata.change24h,
        uuid: incoming.uuid,
      });
      return;
    }

    const existingPriority = sourcePriority[existing.priceSource] ?? 0;
    const incomingPriority = sourcePriority[source] ?? 0;

    let newPrice = existing.price;
    let newSource = existing.priceSource;

    if (
      incomingPrice !== undefined &&
      (incomingPriority > existingPriority ||
        (incomingPriority === existingPriority && now > existing.timestamp))
    ) {
      newPrice = incomingPrice;
      newSource = source;
    }

    const metadata = this.resolveMetadata(symbol, existing, source, incoming);

    this.prices.set(symbol, {
      symbol,
      price: newPrice,
      priceSource: newSource,
      timestamp: now,
      marketCap: metadata.marketCap,
      change24h: metadata.change24h,
      uuid: incoming.uuid ?? existing.uuid,
    });
  }

  updateFromCoinranking(coins: Array<{
    symbol: string;
    price: string | number;
    marketCap?: string | number;
    uuid?: string;
    change?: string | number;
  }>) {
    coins.forEach((coin) => {
      this.mergePrice(
        coin.symbol,
        {
          price: this.toFinite(coin.price),
          marketCap: this.toFinite(coin.marketCap),
          uuid: coin.uuid,
          change24h: this.toFinite(coin.change),
        },
        'coinranking'
      );
    });

    this.notifyListeners();
  }

  updateFromBinance(data: Array<{ symbol: string; price: number }>) {
    data.forEach((item) => {
      this.mergePrice(item.symbol, { price: this.toFinite(item.price) }, 'binance');
    });

    this.notifyListeners();
  }

  updateFromCoinbase(data: Array<{
    symbol: string;
    price: number;
    marketCap?: number;
    change24h?: number;
  }>) {
    data.forEach((item) => {
      this.mergePrice(
        item.symbol,
        {
          price: this.toFinite(item.price),
          marketCap: this.toFinite(item.marketCap),
          change24h: this.toFinite(item.change24h),
        },
        'coinbase'
      );
    });

    this.notifyListeners();
  }

  getAllPrices(): PriceSource[] {
    return Array.from(this.prices.values()).sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  setSourcePriority(newPriority: SourcePriority) {
    sourcePriority = newPriority;
  }

  getStats() {
    const all = this.getAllPrices();

    const sources = {
      coinranking: all.filter((p) => p.priceSource === 'coinranking').length,
      binance: all.filter((p) => p.priceSource === 'binance').length,
      coinbase: all.filter((p) => p.priceSource === 'coinbase').length,
    };

    const pairedMetadata = all.filter((p) => p.marketCap !== undefined && p.change24h !== undefined).length;
    const missingMarketCapWithChange = all.filter((p) => p.marketCap === undefined && p.change24h !== undefined).length;
    const missingChangeWithMarketCap = all.filter((p) => p.marketCap !== undefined && p.change24h === undefined).length;
    const missingBothMetadata = all.filter((p) => p.marketCap === undefined && p.change24h === undefined).length;

    return {
      total: all.length,
      sources,
      priority: sourcePriority,
      metadata: {
        pairedMetadata,
        missingMarketCapWithChange,
        missingChangeWithMarketCap,
        missingBothMetadata,
      },
      timestamp: Date.now(),
    };
  }

  private notifyListeners() {
    this.listeners.forEach((cb) => cb(this.prices));
  }

  subscribe(callback: (prices: Map<string, PriceSource>) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }
}

export const globalPriceStore = new GlobalPriceStore();
