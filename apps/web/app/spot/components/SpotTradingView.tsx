"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Star } from "lucide-react";
import { useAccount } from "wagmi";
import { UnifiedPriceChart } from "@/components/charts";
import { usePriceStore } from "@/contexts/PriceStoreContext";
import { useUserContext } from "@/contexts/UserContext";
import { useKlinesStore } from "@/hooks/candles/useKlineStore";
import { usePythPriceWithConfidence } from "@/hooks/pyth/usePythPriceWithConfidence";
import {
  buildMockSpotOrderBook,
  closeSpotPosition,
  getSpotPositions,
  placeMockSpotOrder,
} from "../../src/lib/api/spotTrading";
import type { SpotMarket, SpotOrderSide } from "../../src/types/spotTrading";
import SpotTicket from "./SpotTicket";
import styles from "../../options/components/styles/OptionsDashboard.module.css";

interface SpotTradingViewProps {
  selectedToken: SpotMarket;
  selectedSymbol: string;
  selectedTimeframe: string;
  onTimeframeChange: (timeframe: string) => void;
}

const PYTH_FEED_IDS: Record<string, string> = {
  BTC: "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  ETH: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  SOL: "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  AVAX: "0x93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7",
  BNB: "0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f",
  LINK: "0x8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221",
};

const timeframeMap = {
  "1m": "1m",
  "5m": "5m",
  "15m": "15m",
  "1h": "1h",
  "4h": "4h",
  "1d": "1d",
};

const SPOT_TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"];

const formatCompactCurrency = (value: number) => {
  if (!value) return "—";
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

export default function SpotTradingView({
  selectedToken,
  selectedSymbol,
  selectedTimeframe,
  onTimeframeChange,
}: SpotTradingViewProps) {
  const { address } = useAccount();
  const { priceMap } = usePriceStore();
  const { isInWatchlist, toggleWatchlistToken } = useUserContext();

  const [positions, setPositions] = useState<Array<Awaited<ReturnType<typeof getSpotPositions>>[number]>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const feedId = PYTH_FEED_IDS[selectedSymbol] ?? PYTH_FEED_IDS.ETH;
  const { data: priceData } = usePythPriceWithConfidence(feedId, 400);
  const { data: candles, loading: chartLoading, exchange } = useKlinesStore(selectedSymbol, {
    interval: timeframeMap[selectedTimeframe as keyof typeof timeframeMap],
    limit: 1000,
  });

  const priceSnapshot = priceMap[selectedSymbol] as { price?: number; change24h?: number; marketCap?: number } | undefined;
  const spotPrice = priceData?.price || priceSnapshot?.price || 0;
  const change24h = priceSnapshot?.change24h || 0;
  const marketCap = priceSnapshot?.marketCap || 0;
  const orderBook = useMemo(() => buildMockSpotOrderBook(selectedSymbol, spotPrice), [selectedSymbol, spotPrice]);

  const refreshPortfolio = useCallback(async () => {
    const storedPositions = await getSpotPositions(address, selectedSymbol);
    setPositions(storedPositions);
  }, [address, selectedSymbol]);

  useEffect(() => {
    refreshPortfolio();
  }, [refreshPortfolio]);

  const handleSubmit = async (side: SpotOrderSide, quantity: number, limitPrice?: number) => {
    setSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      await placeMockSpotOrder({
        trader: address,
        market: selectedToken,
        side,
        quantity,
        executionPrice: limitPrice || spotPrice,
      });
      setMessage(`${side === "buy" ? "Bought" : "Sold"} ${quantity.toFixed(3)} ${selectedSymbol} at ~$${(limitPrice || spotPrice).toFixed(2)}.`);
      await refreshPortfolio();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to place demo spot order");
    } finally {
      setSubmitting(false);
    }
  };

  const portfolioRows = positions.map((position) => {
    const signedMultiplier = position.side === "buy" ? 1 : -1;
    const pnl = (spotPrice - position.entryPrice) * position.quantity * signedMultiplier;
    const notional = spotPrice * position.quantity;

    return {
      ...position,
      pnl,
      notional,
    };
  });

  const bestBid = orderBook.bids[0]?.price ?? spotPrice;
  const bestAsk = orderBook.asks[0]?.price ?? spotPrice;
  const spread = Math.max(bestAsk - bestBid, 0);
  const totalDepth = [...orderBook.bids, ...orderBook.asks].reduce((sum, level) => sum + level.total, 0);
  const watchlisted = isInWatchlist(selectedSymbol);

  return (
    <div className={styles.tradingView}>
      <div className={styles.marketHeader}>
        <div className={styles.marketHeaderMain}>
          <div>
            <p className={styles.eyebrow}>Base spot market</p>
            <h2 className={styles.marketTitle}>{selectedToken.name} Spot</h2>
            <p className={styles.marketSubtitle}>{selectedSymbol}/USDC • live underlying chart • demo order book and portfolio flow</p>
          </div>
          <button
            type="button"
            className={`${styles.watchButton} ${watchlisted ? styles.watchButtonActive : ""}`}
            onClick={async () => toggleWatchlistToken(selectedSymbol)}
          >
            <Star size={15} fill={watchlisted ? "currentColor" : "none"} />
            {watchlisted ? "Watching" : "Watch"}
          </button>
        </div>

        <div className={styles.marketStats}>
          <div className={styles.statCard}><span>Spot</span><strong>${spotPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></div>
          <div className={styles.statCard}><span>24h</span><strong className={change24h >= 0 ? styles.positive : styles.negative}>{change24h >= 0 ? "+" : ""}{change24h.toFixed(2)}%</strong></div>
          <div className={styles.statCard}><span>Best bid</span><strong>${bestBid.toFixed(2)}</strong></div>
          <div className={styles.statCard}><span>Best ask</span><strong>${bestAsk.toFixed(2)}</strong></div>
          <div className={styles.statCard}><span>Spread</span><strong>${spread.toFixed(2)}</strong></div>
        </div>
      </div>

      <div className={styles.topRow}>
        <div className={styles.chartColumn}>
          <UnifiedPriceChart
            candles={candles}
            symbol={selectedSymbol}
            exchange={exchange || "Base / Pyth"}
            surface="futures"
            onTimeframeChange={onTimeframeChange}
            selectedTimeframe={selectedTimeframe}
            isLoading={chartLoading}
            timeframeOptions={SPOT_TIMEFRAMES}
            height={420}
          />
        </div>

        <div className={styles.sideColumn}>
          <SpotTicket
            market={selectedToken}
            spotPrice={spotPrice}
            submitting={submitting}
            message={message}
            error={error}
            onSubmit={handleSubmit}
          />
        </div>
      </div>

      <div className={styles.bottomGrid}>
        <section className={styles.surfaceCard}>
          <div className={styles.surfaceHeader}>
            <div>
              <p className={styles.eyebrow}>Liquidity</p>
              <h3>Order book snapshot</h3>
            </div>
            <span className={styles.baseOnlyBadge}>Top 8 levels</span>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.chainTable}>
              <thead>
                <tr>
                  <th>Bid size</th>
                  <th>Bid</th>
                  <th>Ask</th>
                  <th>Ask size</th>
                </tr>
              </thead>
              <tbody>
                {orderBook.bids.map((bid, index) => {
                  const ask = orderBook.asks[index];
                  return (
                    <tr key={`${bid.price}-${ask?.price ?? index}`}>
                      <td>{bid.size.toFixed(3)}</td>
                      <td className={styles.positive}>${bid.price.toFixed(2)}</td>
                      <td className={styles.negative}>{ask ? `$${ask.price.toFixed(2)}` : "—"}</td>
                      <td>{ask ? ask.size.toFixed(3) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className={styles.positionMetaGrid}>
            <span>Market cap {formatCompactCurrency(marketCap)}</span>
            <span>Total depth {formatCompactCurrency(totalDepth)}</span>
            <span>Reference {exchange || "Pyth / Base"}</span>
          </div>
        </section>

        <section className={styles.surfaceCard}>
          <div className={styles.surfaceHeader}>
            <div>
              <p className={styles.eyebrow}>Portfolio</p>
              <h3>My spot positions</h3>
            </div>
            <span className={styles.baseOnlyBadge}>{portfolioRows.length} open</span>
          </div>

          {portfolioRows.length === 0 ? (
            <div className={styles.emptyState}>
              <p>No open spot positions yet.</p>
              <span>Place a demo order to preview balances, exposure, and mark-to-market P/L.</span>
            </div>
          ) : (
            <div className={styles.positionsList}>
              {portfolioRows.map((position) => (
                <div key={position.id} className={styles.positionCard}>
                  <div className={styles.positionTopRow}>
                    <div>
                      <strong>{position.symbol}/USDC</strong>
                      <div className={styles.subtle}>{position.side.toUpperCase()} • {position.quantity.toFixed(3)} {position.symbol}</div>
                    </div>
                    <span className={position.pnl >= 0 ? styles.positive : styles.negative}>
                      {position.pnl >= 0 ? "+" : ""}${position.pnl.toFixed(2)}
                    </span>
                  </div>

                  <div className={styles.positionMetaGrid}>
                    <span>Entry ${position.entryPrice.toFixed(2)}</span>
                    <span>Mark ${spotPrice.toFixed(2)}</span>
                    <span>Value ${position.notional.toFixed(2)}</span>
                  </div>

                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={async () => {
                      await closeSpotPosition(position.id, address);
                      await refreshPortfolio();
                    }}
                  >
                    Close demo position
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
