import type {
  OptionPosition,
  OptionSeries,
  OptionSide,
  PlaceOptionOrderRequest,
} from "@/types/optionsTrading";

const POSITION_STORAGE_KEY = "options-dashboard.positions.v1";
const FAVORITES_STORAGE_KEY = "options-dashboard.favorites.v1";

const DEFAULT_SPOTS: Record<string, number> = {
  BTC: 68000,
  ETH: 3400,
  SOL: 165,
  AVAX: 42,
  BNB: 610,
  LINK: 18,
};

const EXPIRIES_DAYS = [7, 14, 30, 60, 90];
const STRIKE_OFFSETS = [-0.2, -0.1, -0.05, 0, 0.05, 0.1, 0.2];

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

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const roundToTick = (value: number, spotPrice: number) => {
  const tick = spotPrice >= 10_000 ? 250 : spotPrice >= 1_000 ? 50 : spotPrice >= 100 ? 5 : 1;
  return Math.max(tick, Math.round(value / tick) * tick);
};

const formatExpiryLabel = (date: Date) =>
  date.toLocaleDateString(undefined, { month: "short", day: "numeric" });

const estimatePremium = ({
  spotPrice,
  strike,
  optionType,
  daysToExpiry,
  iv,
}: {
  spotPrice: number;
  strike: number;
  optionType: "call" | "put";
  daysToExpiry: number;
  iv: number;
}) => {
  const intrinsic = optionType === "call" ? Math.max(spotPrice - strike, 0) : Math.max(strike - spotPrice, 0);
  const moneyness = Math.abs(strike - spotPrice) / Math.max(spotPrice, 1);
  const timeValue = spotPrice * (0.018 + iv * 0.11) * Math.sqrt(daysToExpiry / 365) * Math.exp(-moneyness * 4.5);
  return Math.max(0.5, intrinsic + timeValue);
};

export function buildMockOptionChain(symbol: string, liveSpotPrice?: number): OptionSeries[] {
  const spotPrice = Math.max(liveSpotPrice || DEFAULT_SPOTS[symbol] || 100, 1);

  return EXPIRIES_DAYS.flatMap((daysToExpiry) => {
    const expiryDate = new Date(Date.now() + daysToExpiry * 24 * 60 * 60 * 1000);
    const expiry = expiryDate.toISOString();
    const expiryLabel = formatExpiryLabel(expiryDate);

    return STRIKE_OFFSETS.flatMap((offset) => {
      const strike = roundToTick(spotPrice * (1 + offset), spotPrice);

      return (["call", "put"] as const).map((optionType) => {
        const seed = `${symbol}-${daysToExpiry}-${strike}-${optionType}`;
        const iv = seeded(`${seed}-iv`, 0.42, 0.88) + Math.abs(offset) * 0.18;
        const mark = estimatePremium({ spotPrice, strike, optionType, daysToExpiry, iv });
        const spreadBps = seeded(`${seed}-spread`, 0.012, 0.026);
        const bid = mark * (1 - spreadBps / 2);
        const ask = mark * (1 + spreadBps / 2);
        const deltaBase = clamp(0.5 + ((spotPrice - strike) / Math.max(spotPrice, 1)) * 2.2, 0.05, 0.95);
        const delta = optionType === "call" ? deltaBase : -deltaBase;
        const gamma = seeded(`${seed}-gamma`, 0.01, 0.08);
        const theta = -mark * seeded(`${seed}-theta`, 0.015, 0.04);
        const vega = mark * seeded(`${seed}-vega`, 0.06, 0.18);
        const change24h = seeded(`${seed}-change`, -12, 12);
        const volume = Math.round(seeded(`${seed}-volume`, 120, 5200));
        const openInterest = Math.round(seeded(`${seed}-oi`, 350, 14000));
        const breakeven = optionType === "call" ? strike + ask : strike - ask;
        const inTheMoney = optionType === "call" ? spotPrice > strike : spotPrice < strike;

        return {
          id: seed,
          underlying: symbol,
          optionType,
          strike,
          expiry,
          expiryLabel,
          daysToExpiry,
          iv,
          bid,
          ask,
          mark,
          change24h,
          volume,
          openInterest,
          delta,
          gamma,
          theta,
          vega,
          breakeven,
          inTheMoney,
        } satisfies OptionSeries;
      });
    });
  }).sort((left, right) => {
    if (left.daysToExpiry !== right.daysToExpiry) return left.daysToExpiry - right.daysToExpiry;
    if (left.strike !== right.strike) return left.strike - right.strike;
    return left.optionType.localeCompare(right.optionType);
  });
}

export async function getOptionPositions(trader?: string, underlying?: string): Promise<OptionPosition[]> {
  const scopedTrader = trader || "guest";
  const allPositions = readJson<OptionPosition[]>(POSITION_STORAGE_KEY, []);
  return allPositions.filter((position) => {
    if (position.trader !== scopedTrader) return false;
    if (underlying && position.underlying !== underlying) return false;
    return position.status === "open";
  });
}

export async function placeMockOptionOrder({
  trader,
  series,
  side,
  quantity,
}: PlaceOptionOrderRequest): Promise<OptionPosition> {
  const scopedTrader = trader || "guest";
  const allPositions = readJson<OptionPosition[]>(POSITION_STORAGE_KEY, []);
  const entryPremium = side === "buy" ? series.ask : series.bid;

  const nextPosition: OptionPosition = {
    id: `${series.id}-${Date.now()}`,
    trader: scopedTrader,
    seriesId: series.id,
    underlying: series.underlying,
    optionType: series.optionType,
    side,
    strike: series.strike,
    expiry: series.expiry,
    expiryLabel: series.expiryLabel,
    quantity,
    entryPremium,
    openedAt: new Date().toISOString(),
    status: "open",
  };

  allPositions.unshift(nextPosition);
  writeJson(POSITION_STORAGE_KEY, allPositions);
  return nextPosition;
}

export async function closeOptionPosition(positionId: string, trader?: string): Promise<void> {
  const scopedTrader = trader || "guest";
  const allPositions = readJson<OptionPosition[]>(POSITION_STORAGE_KEY, []);
  writeJson(
    POSITION_STORAGE_KEY,
    allPositions.map((position) =>
      position.id === positionId && position.trader === scopedTrader
        ? { ...position, status: "closed" as const }
        : position,
    ),
  );
}

export async function getFavoriteSeries(trader?: string): Promise<string[]> {
  const scopedTrader = trader || "guest";
  const allFavorites = readJson<Record<string, string[]>>(FAVORITES_STORAGE_KEY, {});
  return allFavorites[scopedTrader] ?? [];
}

export async function toggleFavoriteSeries(seriesId: string, trader?: string): Promise<string[]> {
  const scopedTrader = trader || "guest";
  const allFavorites = readJson<Record<string, string[]>>(FAVORITES_STORAGE_KEY, {});
  const current = new Set(allFavorites[scopedTrader] ?? []);

  if (current.has(seriesId)) {
    current.delete(seriesId);
  } else {
    current.add(seriesId);
  }

  const next = Array.from(current);
  writeJson(FAVORITES_STORAGE_KEY, {
    ...allFavorites,
    [scopedTrader]: next,
  });
  return next;
}

export const getOrderCostEstimate = (series: OptionSeries, side: OptionSide, quantity: number) => {
  const unitPremium = side === "buy" ? series.ask : series.bid;
  return unitPremium * quantity;
};
