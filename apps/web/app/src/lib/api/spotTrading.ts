import type {
  PlaceSpotOrderRequest,
  SpotOrderBook,
  SpotOrderEstimate,
  SpotOrderSide,
  SpotPosition,
} from "../../types/spotTrading";

const POSITION_STORAGE_KEY = "spot-dashboard.positions.v1";

const DEFAULT_SPOTS: Record<string, number> = {
  BTC: 68000,
  ETH: 3400,
  SOL: 165,
  AVAX: 42,
  BNB: 610,
  LINK: 18,
};

const getStorage = () => (typeof window === "undefined" ? null : window.localStorage);

const readJson = <T>(key: string, fallback: T): T => {
  const storage = getStorage();
  if (!storage) return fallback;

  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown) => {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(key, JSON.stringify(value));
};

const hashSeed = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
};

const seeded = (seed: string, min = 0, max = 1) => {
  const normalized = (hashSeed(seed) % 10_000) / 10_000;
  return min + normalized * (max - min);
};

const getReferencePrice = (symbol: string, liveSpotPrice?: number) => {
  return Math.max(liveSpotPrice || DEFAULT_SPOTS[symbol] || 100, 0.0001);
};

const getTickSize = (price: number) => {
  if (price >= 10_000) return 10;
  if (price >= 1_000) return 1;
  if (price >= 100) return 0.1;
  if (price >= 1) return 0.01;
  return 0.0001;
};

export function buildMockSpotOrderBook(symbol: string, liveSpotPrice?: number): SpotOrderBook {
  const mid = getReferencePrice(symbol, liveSpotPrice);
  const tick = getTickSize(mid);

  const bids = Array.from({ length: 8 }, (_, index) => {
    const step = tick * (index + 1) * seeded(`${symbol}-bid-step-${index}`, 0.8, 1.4);
    const price = Math.max(mid - step, tick);
    const size = seeded(`${symbol}-bid-size-${index}`, 0.4, 8.5);
    return {
      price,
      size,
      total: price * size,
    };
  });

  const asks = Array.from({ length: 8 }, (_, index) => {
    const step = tick * (index + 1) * seeded(`${symbol}-ask-step-${index}`, 0.8, 1.4);
    const price = mid + step;
    const size = seeded(`${symbol}-ask-size-${index}`, 0.4, 8.5);
    return {
      price,
      size,
      total: price * size,
    };
  });

  return { bids, asks };
}

export async function getSpotPositions(trader?: string, symbol?: string): Promise<SpotPosition[]> {
  const scopedTrader = trader || "guest";
  const allPositions = readJson<SpotPosition[]>(POSITION_STORAGE_KEY, []);
  return allPositions.filter((position) => {
    if (position.trader !== scopedTrader) return false;
    if (symbol && position.symbol !== symbol) return false;
    return position.status === "open";
  });
}

export async function placeMockSpotOrder({
  trader,
  market,
  side,
  quantity,
  executionPrice,
}: PlaceSpotOrderRequest): Promise<SpotPosition> {
  const scopedTrader = trader || "guest";
  const allPositions = readJson<SpotPosition[]>(POSITION_STORAGE_KEY, []);

  const nextPosition: SpotPosition = {
    id: `${market.symbol}-${Date.now()}`,
    trader: scopedTrader,
    symbol: market.symbol,
    name: market.name,
    side,
    quantity,
    entryPrice: executionPrice,
    openedAt: new Date().toISOString(),
    status: "open",
  };

  allPositions.unshift(nextPosition);
  writeJson(POSITION_STORAGE_KEY, allPositions);
  return nextPosition;
}

export async function closeSpotPosition(positionId: string, trader?: string): Promise<void> {
  const scopedTrader = trader || "guest";
  const allPositions = readJson<SpotPosition[]>(POSITION_STORAGE_KEY, []);
  writeJson(
    POSITION_STORAGE_KEY,
    allPositions.map((position) =>
      position.id === positionId && position.trader === scopedTrader
        ? { ...position, status: "closed" as const }
        : position,
    ),
  );
}

export function getSpotOrderEstimate({
  side,
  quantity,
  referencePrice,
  limitPrice,
}: {
  side: SpotOrderSide;
  quantity: number;
  referencePrice: number;
  limitPrice?: number;
}): SpotOrderEstimate {
  const executionPrice = limitPrice && limitPrice > 0 ? limitPrice : referencePrice;
  const notional = executionPrice * quantity;
  const feeRate = side === "buy" ? 0.0012 : 0.001;
  const fees = notional * feeRate;

  return {
    executionPrice,
    notional,
    fees,
    total: side === "buy" ? notional + fees : Math.max(notional - fees, 0),
  };
}
