export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closed: boolean;
}

type Interval = string; // '1m', '5m', etc.
const MAX_CANDLES_PER_SERIES = 1000;

class KlineStore {
  private store = new Map<string, Map<Interval, Candle[]>>();

  private key(symbol: string) {
    return symbol.toUpperCase();
  }

  setHistorical(symbol: string, interval: Interval, candles: Candle[]) {
    const sym = this.key(symbol);
    if (!this.store.has(sym)) {
      this.store.set(sym, new Map());
    }
    this.store.get(sym)!.set(interval, candles.slice(-MAX_CANDLES_PER_SERIES));
  }

  updateLive(symbol: string, interval: Interval, candle: Candle) {
    const sym = this.key(symbol);
    if (!this.store.has(sym)) return;

    const intervalMap = this.store.get(sym)!;
    const existing = intervalMap.get(interval);
    if (!existing) return;

    const last = existing[existing.length - 1];

    if (!last || last.timestamp !== candle.timestamp) {
      existing.push(candle);
      if (existing.length > MAX_CANDLES_PER_SERIES) {
        existing.splice(0, existing.length - MAX_CANDLES_PER_SERIES);
      }
    } else {
      existing[existing.length - 1] = candle;
    }
  }

  get(symbol: string, interval: Interval): Candle[] {
    const sym = this.key(symbol);
    return this.store.get(sym)?.get(interval) || [];
  }
}

export const klineStore = new KlineStore();