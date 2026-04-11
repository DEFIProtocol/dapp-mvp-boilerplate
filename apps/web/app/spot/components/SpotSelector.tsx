"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Search, Star, TrendingDown, TrendingUp } from "lucide-react";
import { usePerps } from "@/contexts/PerpsContext";
import { usePriceStore } from "@/contexts/PriceStoreContext";
import { useUserContext } from "@/contexts/UserContext";
import type { SpotMarket } from "../../src/types/spotTrading";
import styles from "../../futures/components/styles/TokenSelector.module.css";

interface SpotSelectorProps {
  onSelectToken: (token: SpotMarket) => void;
  selectedSymbol?: string;
}

type SortKey = "symbol" | "price" | "change" | "marketCap";

export default function SpotSelector({ onSelectToken, selectedSymbol }: SpotSelectorProps) {
  const { activeTokens, loading: perpsLoading } = usePerps();
  const { priceMap, loading: priceLoading } = usePriceStore();
  const { isInWatchlist, toggleWatchlistToken } = useUserContext();

  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: "asc" | "desc" }>({
    key: "marketCap",
    direction: "desc",
  });

  const filteredAndSortedTokens = useMemo(() => {
    let filtered = activeTokens;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((token) =>
        token.symbol.toLowerCase().includes(term) || token.name.toLowerCase().includes(term),
      );
    }

    return [...filtered].sort((left, right) => {
      const leftPrice = priceMap[left.symbol]?.price || 0;
      const rightPrice = priceMap[right.symbol]?.price || 0;
      const leftChange = (priceMap[left.symbol] as { change24h?: number } | undefined)?.change24h || 0;
      const rightChange = (priceMap[right.symbol] as { change24h?: number } | undefined)?.change24h || 0;
      const leftCap = (priceMap[left.symbol] as { marketCap?: number } | undefined)?.marketCap || 0;
      const rightCap = (priceMap[right.symbol] as { marketCap?: number } | undefined)?.marketCap || 0;

      const leftValue = sortConfig.key === "symbol"
        ? left.symbol
        : sortConfig.key === "price"
          ? leftPrice
          : sortConfig.key === "change"
            ? leftChange
            : leftCap;

      const rightValue = sortConfig.key === "symbol"
        ? right.symbol
        : sortConfig.key === "price"
          ? rightPrice
          : sortConfig.key === "change"
            ? rightChange
            : rightCap;

      if (leftValue < rightValue) return sortConfig.direction === "asc" ? -1 : 1;
      if (leftValue > rightValue) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [activeTokens, priceMap, searchTerm, sortConfig]);

  const handleSort = (key: SortKey) => {
    setSortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  const getSortIcon = (key: SortKey) => {
    if (sortConfig.key !== key) return <span className={styles.sortIconPlaceholder}>↕️</span>;
    return sortConfig.direction === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
  };

  const formatPrice = (price: number) => {
    if (!price) return "$0.00";
    if (price < 0.01) return `$${price.toFixed(6)}`;
    if (price < 1) return `$${price.toFixed(4)}`;
    return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatMarketCap = (marketCap: number) => {
    if (!marketCap) return "—";
    if (marketCap >= 1e9) return `$${(marketCap / 1e9).toFixed(2)}B`;
    if (marketCap >= 1e6) return `$${(marketCap / 1e6).toFixed(2)}M`;
    return `$${(marketCap / 1e3).toFixed(2)}K`;
  };

  if (perpsLoading || priceLoading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingSpinner}></div>
        <div className={styles.loadingText}>Loading spot markets...</div>
      </div>
    );
  }

  return (
    <div className={styles.tokenSelector}>
      <div className={styles.header}>
        <h2 className={styles.title}>Base Spot Markets</h2>
        <div className={styles.stats}>
          <span className={styles.statItem}>
            <span className={styles.statLabel}>Pairs</span>
            <span className={styles.statValue}>{activeTokens.length}</span>
          </span>
          <span className={styles.statItem}>
            <span className={styles.statLabel}>Watchlist</span>
            <span className={styles.statValue}>{activeTokens.filter((token) => isInWatchlist(token.symbol)).length}</span>
          </span>
        </div>
      </div>

      <div className={styles.searchContainer}>
        <Search size={16} className={styles.searchIcon} />
        <input
          type="text"
          placeholder="Search spot pairs..."
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          className={styles.searchInput}
        />
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.tokenTable}>
          <thead>
            <tr>
              <th onClick={() => handleSort("symbol")} className={styles.sortable}>
                <span className={styles.headerLabelWrap}>Asset {getSortIcon("symbol")}</span>
              </th>
              <th onClick={() => handleSort("price")} className={`${styles.sortable} ${styles.rightHeader}`}>
                <span className={`${styles.headerLabelWrap} ${styles.rightHeaderLabel}`}>Spot {getSortIcon("price")}</span>
              </th>
              <th onClick={() => handleSort("change")} className={`${styles.sortable} ${styles.rightHeader}`}>
                <span className={`${styles.headerLabelWrap} ${styles.rightHeaderLabel}`}>24h {getSortIcon("change")}</span>
              </th>
              <th onClick={() => handleSort("marketCap")} className={`${styles.sortable} ${styles.rightHeader}`}>
                <span className={`${styles.headerLabelWrap} ${styles.rightHeaderLabel}`}>Market Cap {getSortIcon("marketCap")}</span>
              </th>
              <th className={styles.centerHeader}>Watch</th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedTokens.map((token) => {
              const priceData = priceMap[token.symbol] as { price?: number; change24h?: number; marketCap?: number } | undefined;
              const price = priceData?.price || 0;
              const change24h = priceData?.change24h || 0;
              const marketCap = priceData?.marketCap || 0;
              const positive = change24h >= 0;
              const selected = token.symbol === selectedSymbol;
              const watchlisted = isInWatchlist(token.symbol);

              return (
                <tr
                  key={token.symbol}
                  className={`${styles.tokenRow} ${selected ? styles.selected : ""}`}
                  onClick={() => onSelectToken(token)}
                >
                  <td className={styles.tokenCell}>
                    <div className={styles.tokenInfo}>
                      {token.icon_url ? (
                        <img src={token.icon_url} alt={token.symbol} className={styles.tokenIcon} />
                      ) : (
                        <div className={styles.tokenIconPlaceholder}>{token.symbol.charAt(0)}</div>
                      )}
                      <div>
                        <div className={styles.tokenSymbolRow}>
                          <div className={styles.tokenSymbol}>{token.symbol}</div>
                          <span className={styles.inlineLeverageBadge}>Base only</span>
                        </div>
                        <div className={styles.tokenName}>{token.name}</div>
                      </div>
                    </div>
                  </td>
                  <td className={`${styles.priceCell} ${styles.rightCell}`}>{formatPrice(price)}</td>
                  <td className={styles.rightCell}>
                    <div className={`${styles.changeBadge} ${positive ? styles.positive : styles.negative}`}>
                      {positive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {positive ? "+" : ""}{change24h.toFixed(2)}%
                    </div>
                  </td>
                  <td className={`${styles.marketCapCell} ${styles.rightCell}`}>{formatMarketCap(marketCap)}</td>
                  <td className={styles.centerCell}>
                    <button
                      type="button"
                      className={`${styles.watchButton} ${watchlisted ? styles.watchButtonActive : ""}`}
                      title={watchlisted ? "Remove from watchlist" : "Add to watchlist"}
                      onClick={async (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        await toggleWatchlistToken(token.symbol);
                      }}
                    >
                      <Star size={14} className={styles.watchIcon} fill={watchlisted ? "currentColor" : "none"} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={styles.footer}>
        <span>Showing {filteredAndSortedTokens.length} spot pairs on Base</span>
      </div>
    </div>
  );
}
