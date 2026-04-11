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
  buildMockOptionChain,
  closeOptionPosition,
  getFavoriteSeries,
  getOptionPositions,
  placeMockOptionOrder,
  toggleFavoriteSeries,
} from "@/lib/api/optionsTrading";
import type { OptionPosition, OptionSeries, OptionSide, OptionsUnderlying } from "@/types/optionsTrading";
import OptionTicket from "./OptionTicket";
import styles from "./styles/OptionsDashboard.module.css";

interface OptionsTradingViewProps {
  selectedToken: OptionsUnderlying;
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

const OPTIONS_TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"];

export default function OptionsTradingView({
  selectedToken,
  selectedSymbol,
  selectedTimeframe,
  onTimeframeChange,
}: OptionsTradingViewProps) {
  const { address } = useAccount();
  const { priceMap } = usePriceStore();
  const { isInWatchlist, toggleWatchlistToken } = useUserContext();

  const [selectedExpiry, setSelectedExpiry] = useState("all");
  const [selectedType, setSelectedType] = useState<"all" | "call" | "put">("all");
  const [search, setSearch] = useState("");
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [favoriteSeriesIds, setFavoriteSeriesIds] = useState<string[]>([]);
  const [positions, setPositions] = useState<OptionPosition[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const feedId = PYTH_FEED_IDS[selectedSymbol] ?? PYTH_FEED_IDS.ETH;
  const { data: priceData } = usePythPriceWithConfidence(feedId, 400);
  const { data: candles, loading: chartLoading, exchange } = useKlinesStore(selectedSymbol, {
    interval: timeframeMap[selectedTimeframe as keyof typeof timeframeMap],
    limit: 1000,
  });

  const spotPrice = priceData?.price || (priceMap[selectedSymbol] as { price?: number } | undefined)?.price || 0;
  const optionChain = useMemo(() => buildMockOptionChain(selectedSymbol, spotPrice), [selectedSymbol, spotPrice]);

  const expiries = useMemo(
    () => Array.from(new Set(optionChain.map((series) => series.expiryLabel))),
    [optionChain],
  );

  const filteredSeries = useMemo(() => {
    return optionChain.filter((series) => {
      if (selectedExpiry !== "all" && series.expiryLabel !== selectedExpiry) return false;
      if (selectedType !== "all" && series.optionType !== selectedType) return false;
      if (search) {
        const normalized = search.toLowerCase();
        if (!`${series.underlying} ${series.strike} ${series.expiryLabel}`.toLowerCase().includes(normalized)) {
          return false;
        }
      }
      return true;
    });
  }, [optionChain, selectedExpiry, selectedType, search]);

  useEffect(() => {
    if (!filteredSeries.length) {
      setSelectedSeriesId(null);
      return;
    }

    if (!selectedSeriesId || !filteredSeries.some((series) => series.id === selectedSeriesId)) {
      setSelectedSeriesId(filteredSeries[0].id);
    }
  }, [filteredSeries, selectedSeriesId]);

  const selectedSeries = useMemo(
    () => filteredSeries.find((series) => series.id === selectedSeriesId) ?? filteredSeries[0],
    [filteredSeries, selectedSeriesId],
  );

  const refreshPortfolio = useCallback(async () => {
    const [storedPositions, storedFavorites] = await Promise.all([
      getOptionPositions(address, selectedSymbol),
      getFavoriteSeries(address),
    ]);

    setPositions(storedPositions);
    setFavoriteSeriesIds(storedFavorites);
  }, [address, selectedSymbol]);

  useEffect(() => {
    refreshPortfolio();
  }, [refreshPortfolio]);

  const handleSubmit = async (side: OptionSide, quantity: number) => {
    if (!selectedSeries) return;

    setSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      await placeMockOptionOrder({
        trader: address,
        series: selectedSeries,
        side,
        quantity,
      });
      setMessage(`${side === "buy" ? "Bought" : "Sold"} ${quantity} ${selectedSeries.underlying} ${selectedSeries.optionType.toUpperCase()} contracts.`);
      await refreshPortfolio();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to place demo order");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleFavorite = async (seriesId: string) => {
    const next = await toggleFavoriteSeries(seriesId, address);
    setFavoriteSeriesIds(next);
  };

  const portfolioRows = positions.map((position) => {
    const liveSeries = optionChain.find((series) => series.id === position.seriesId);
    const currentMark = liveSeries?.mark ?? position.entryPremium;
    const signedMultiplier = position.side === "buy" ? 1 : -1;
    const pnl = (currentMark - position.entryPremium) * position.quantity * signedMultiplier;
    const expiryMs = new Date(position.expiry).getTime() - Date.now();
    const daysRemaining = Math.max(0, Math.ceil(expiryMs / (1000 * 60 * 60 * 24)));

    return {
      ...position,
      currentMark,
      pnl,
      daysRemaining,
    };
  });

  const totalOpenInterest = filteredSeries.reduce((sum, item) => sum + item.openInterest, 0);
  const totalVolume = filteredSeries.reduce((sum, item) => sum + item.volume, 0);
  const watchlisted = isInWatchlist(selectedSymbol);

  return (
    <div className={styles.tradingView}>
      <div className={styles.marketHeader}>
        <div className={styles.marketHeaderMain}>
          <div>
            <p className={styles.eyebrow}>Base options market</p>
            <h2 className={styles.marketTitle}>{selectedToken.name} Options</h2>
            <p className={styles.marketSubtitle}>{selectedSymbol} underlying • single-leg demo terminal • styled to match futures</p>
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
          <div className={styles.statCard}><span>ATM IV</span><strong>{selectedSeries ? `${(selectedSeries.iv * 100).toFixed(1)}%` : "—"}</strong></div>
          <div className={styles.statCard}><span>Breakeven</span><strong>{selectedSeries ? `$${selectedSeries.breakeven.toFixed(2)}` : "—"}</strong></div>
          <div className={styles.statCard}><span>Open interest</span><strong>{totalOpenInterest.toLocaleString()}</strong></div>
          <div className={styles.statCard}><span>Volume</span><strong>{totalVolume.toLocaleString()}</strong></div>
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
            timeframeOptions={OPTIONS_TIMEFRAMES}
            height={420}
          />
        </div>

        <div className={styles.sideColumn}>
          <OptionTicket
            series={selectedSeries}
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
              <p className={styles.eyebrow}>Discover</p>
              <h3>Options chain</h3>
            </div>
            <div className={styles.filterRow}>
              <select value={selectedExpiry} onChange={(event) => setSelectedExpiry(event.target.value)} className={styles.select}>
                <option value="all">All expiries</option>
                {expiries.map((expiry) => (
                  <option key={expiry} value={expiry}>{expiry}</option>
                ))}
              </select>
              <div className={styles.toggleGroup}>
                <button type="button" className={`${styles.toggleButton} ${selectedType === "all" ? styles.toggleButtonActive : ""}`} onClick={() => setSelectedType("all")}>All</button>
                <button type="button" className={`${styles.toggleButton} ${selectedType === "call" ? styles.toggleButtonActive : ""}`} onClick={() => setSelectedType("call")}>Calls</button>
                <button type="button" className={`${styles.toggleButton} ${selectedType === "put" ? styles.toggleButtonActive : ""}`} onClick={() => setSelectedType("put")}>Puts</button>
              </div>
            </div>
          </div>

          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter strikes or expiries..."
            className={styles.searchInput}
          />

          <div className={styles.tableWrap}>
            <table className={styles.chainTable}>
              <thead>
                <tr>
                  <th>Fav</th>
                  <th>Type</th>
                  <th>Strike</th>
                  <th>Expiry</th>
                  <th>IV</th>
                  <th>Mark</th>
                  <th>Bid / Ask</th>
                  <th>OI</th>
                  <th>Vol</th>
                  <th>24h</th>
                </tr>
              </thead>
              <tbody>
                {filteredSeries.map((series) => {
                  const favorited = favoriteSeriesIds.includes(series.id);
                  const selected = selectedSeries?.id === series.id;
                  return (
                    <tr
                      key={series.id}
                      className={selected ? styles.selectedRow : undefined}
                      onClick={() => setSelectedSeriesId(series.id)}
                    >
                      <td>
                        <button
                          type="button"
                          className={styles.iconButton}
                          onClick={async (event) => {
                            event.stopPropagation();
                            await handleToggleFavorite(series.id);
                          }}
                        >
                          <Star size={14} fill={favorited ? "currentColor" : "none"} />
                        </button>
                      </td>
                      <td><span className={`${styles.typeBadge} ${series.optionType === "call" ? styles.callBadge : styles.putBadge}`}>{series.optionType.toUpperCase()}</span></td>
                      <td>${series.strike.toLocaleString()}</td>
                      <td>{series.expiryLabel} <span className={styles.subtle}>({series.daysToExpiry}d)</span></td>
                      <td>{(series.iv * 100).toFixed(1)}%</td>
                      <td>${series.mark.toFixed(2)}</td>
                      <td>${series.bid.toFixed(2)} / ${series.ask.toFixed(2)}</td>
                      <td>{series.openInterest.toLocaleString()}</td>
                      <td>{series.volume.toLocaleString()}</td>
                      <td className={series.change24h >= 0 ? styles.positive : styles.negative}>{series.change24h >= 0 ? "+" : ""}{series.change24h.toFixed(2)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.surfaceCard}>
          <div className={styles.surfaceHeader}>
            <div>
              <p className={styles.eyebrow}>Portfolio</p>
              <h3>My positions & P/L</h3>
            </div>
            <span className={styles.baseOnlyBadge}>{portfolioRows.length} open</span>
          </div>

          {portfolioRows.length === 0 ? (
            <div className={styles.emptyState}>
              <p>No open option positions yet.</p>
              <span>Use the order ticket to place a demo buy or sell and preview the frontend flow.</span>
            </div>
          ) : (
            <div className={styles.positionsList}>
              {portfolioRows.map((position) => (
                <div key={position.id} className={styles.positionCard}>
                  <div className={styles.positionTopRow}>
                    <div>
                      <strong>{position.underlying} {position.optionType.toUpperCase()} ${position.strike}</strong>
                      <div className={styles.subtle}>{position.expiryLabel} • {position.side.toUpperCase()} • {position.quantity} contracts</div>
                    </div>
                    <span className={position.pnl >= 0 ? styles.positive : styles.negative}>
                      {position.pnl >= 0 ? "+" : ""}${position.pnl.toFixed(2)}
                    </span>
                  </div>

                  <div className={styles.positionMetaGrid}>
                    <span>Entry ${position.entryPremium.toFixed(2)}</span>
                    <span>Mark ${position.currentMark.toFixed(2)}</span>
                    <span>DTE {position.daysRemaining}d</span>
                  </div>

                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={async () => {
                      await closeOptionPosition(position.id, address);
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
