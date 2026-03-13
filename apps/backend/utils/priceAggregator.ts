// apps/backend/utils/priceAggregator.ts
//
// Combines Chainlink (via OracleService) and Pyth as oracle-grade index-price sources.
// Binance and Coinbase are validation rails only — never used as liquidation truth.
// Coinranking is intentionally excluded from all critical paths.
//
// Circuit breaker prevents liquidation calls when:
//   - No fresh oracle-grade source is available
//   - Chainlink/Pyth spread exceeds MAX_CHAINLINK_PYTH_DIV_PCT
//   - Oracle index vs CEX median spread exceeds MAX_ORACLE_VS_CEX_DIV_PCT

import { OracleService } from '../oracle/oracleService';
import { PythService } from '../pyth/pythService';
import { globalPriceStore } from './globalPriceStore';

// ======================== THRESHOLDS ========================
const MAX_ORACLE_AGE_MS          = 120_000; // 2 min — Chainlink & Pyth
const MAX_CEX_AGE_MS             = 30_000;  // 30 sec — Binance & Coinbase
const MAX_CHAINLINK_PYTH_DIV_PCT = 0.5;     // 0.5 %
const MAX_ORACLE_VS_CEX_DIV_PCT  = 2.0;     // 2 %

// ======================== TYPES ========================
export interface SourceSnapshot {
  price: number;
  timestamp: number;
  ageMs: number;
  stale: boolean;
}

export interface AggregatedPrice {
  symbol: string;
  feedId: string;
  indexPrice: number;  // oracle-grade median (Chainlink + Pyth, non-stale sources only)
  markPrice: number;   // shadow mark = index until on-chain MarkPrice.sol/TWAP warms up
  sources: {
    chainlink: SourceSnapshot | null;
    pyth: (SourceSnapshot & { confidence: number }) | null;
    binance: SourceSnapshot | null;   // validation rail
    coinbase: SourceSnapshot | null;  // validation rail
  };
  divergence: {
    chainlinkVsPythPct: number | null;
    oracleVsCexPct: number | null;
    withinBounds: boolean;
  };
  circuitBreaker: {
    triggered: boolean;
    reasons: string[];
  };
  timestamp: number;
}

// ======================== MARKET CONFIG ========================
// Maps normalised symbol → oracle source identifiers.
//   chainlink token keys must match PRIORITY_FEEDS in oracle/types/oracle.ts
//   pyth feedIds must match PYTH_PRICE_FEEDS in pyth/types/pyth.ts (ethereum chain)
interface MarketSourceConfig {
  chainlink: { chain: string; token: string } | null;
  pyth: { feedId: string } | null;
}

export const MARKET_SOURCES: Record<string, MarketSourceConfig> = {
  BTC: {
    chainlink: { chain: 'ethereum', token: 'btc' },
    pyth:      { feedId: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43' },
  },
  ETH: {
    chainlink: { chain: 'ethereum', token: 'eth' },
    pyth:      { feedId: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace' },
  },
  SOL: {
    chainlink: { chain: 'ethereum', token: 'sol' },
    pyth:      { feedId: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d' },
  },
};

// ======================== HELPERS ========================
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function divergencePct(a: number, b: number): number {
  if (a <= 0 || b <= 0) return 0;
  return (Math.abs(a - b) / Math.min(a, b)) * 100;
}

// ======================== SINGLETONS ========================
const oracleService = new OracleService();
const pythService   = new PythService();

// ======================== MAIN EXPORT ========================
export async function getAggregatedPrice(symbol: string): Promise<AggregatedPrice | null> {
  const key    = symbol.toUpperCase();
  const config = MARKET_SOURCES[key];
  if (!config) return null;

  const now     = Date.now();
  const reasons: string[] = [];

  // --- Chainlink ---
  let chainlink: AggregatedPrice['sources']['chainlink'] = null;
  if (config.chainlink) {
    try {
      const round = await oracleService.getLatestRound(config.chainlink.chain, config.chainlink.token);
      if (round && round.price > 0) {
        const ageMs = now - round.timestamp;
        chainlink = { price: round.price, timestamp: round.timestamp, ageMs, stale: ageMs > MAX_ORACLE_AGE_MS };
      }
    } catch {
      /* source temporarily unavailable — proceed without it */
    }
  }

  // --- Pyth ---
  let pyth: AggregatedPrice['sources']['pyth'] = null;
  if (config.pyth) {
    try {
      const feed = await pythService.getPriceWithConfidence(config.pyth.feedId);
      if (feed && feed.price > 0) {
        const ageMs = now - feed.timestamp;
        pyth = {
          price: feed.price,
          confidence: feed.confidence,
          timestamp: feed.timestamp,
          ageMs,
          stale: ageMs > MAX_ORACLE_AGE_MS,
        };
      }
    } catch {
      /* source temporarily unavailable — proceed without it */
    }
  }

  // --- CEX validation rails (read from globalPriceStore, never liquidation truth) ---
  const allPrices = globalPriceStore.getAllPrices();

  function cexSnapshot(source: 'binance' | 'coinbase'): SourceSnapshot | null {
    const entry = allPrices.find(p => p.symbol === key && p.priceSource === source);
    if (!entry || entry.price <= 0) return null;
    const ageMs = now - entry.timestamp;
    return { price: entry.price, timestamp: entry.timestamp, ageMs, stale: ageMs > MAX_CEX_AGE_MS };
  }

  const binance  = cexSnapshot('binance');
  const coinbase = cexSnapshot('coinbase');

  // --- Oracle-grade index (median of non-stale Chainlink + Pyth) ---
  const freshOraclePrices = [chainlink, pyth]
    .filter((s): s is NonNullable<typeof chainlink> => s !== null && !s.stale)
    .map(s => s.price);

  if (freshOraclePrices.length === 0) {
    reasons.push('No fresh oracle-grade sources (Chainlink + Pyth) available');
  }

  const indexPrice = freshOraclePrices.length > 0 ? median(freshOraclePrices) : 0;

  // --- CEX median (validation rail only) ---
  const freshCexPrices = [binance, coinbase]
    .filter((s): s is SourceSnapshot => s !== null && !s.stale)
    .map(s => s.price);
  const cexMedian = freshCexPrices.length > 0 ? median(freshCexPrices) : 0;

  // --- Divergence checks ---
  let chainlinkVsPythPct: number | null = null;
  if (chainlink && !chainlink.stale && pyth && !pyth.stale) {
    chainlinkVsPythPct = divergencePct(chainlink.price, pyth.price);
    if (chainlinkVsPythPct > MAX_CHAINLINK_PYTH_DIV_PCT) {
      reasons.push(
        `Chainlink/Pyth divergence ${chainlinkVsPythPct.toFixed(3)}% exceeds ${MAX_CHAINLINK_PYTH_DIV_PCT}%`
      );
    }
  }

  let oracleVsCexPct: number | null = null;
  if (indexPrice > 0 && cexMedian > 0) {
    oracleVsCexPct = divergencePct(indexPrice, cexMedian);
    if (oracleVsCexPct > MAX_ORACLE_VS_CEX_DIV_PCT) {
      reasons.push(
        `Oracle/CEX divergence ${oracleVsCexPct.toFixed(3)}% exceeds ${MAX_ORACLE_VS_CEX_DIV_PCT}%`
      );
    }
  }

  return {
    symbol: key,
    feedId: config.pyth?.feedId ?? '',
    indexPrice,
    markPrice: indexPrice, // shadow mark = index until on-chain MarkPrice/TWAP is live
    sources: { chainlink, pyth, binance, coinbase },
    divergence: {
      chainlinkVsPythPct,
      oracleVsCexPct,
      withinBounds: reasons.length === 0,
    },
    circuitBreaker: {
      triggered: reasons.length > 0,
      reasons,
    },
    timestamp: now,
  };
}

export function getSupportedSymbols(): string[] {
  return Object.keys(MARKET_SOURCES);
}
