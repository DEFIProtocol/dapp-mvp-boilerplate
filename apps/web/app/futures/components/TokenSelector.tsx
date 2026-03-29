// app/crypto/components/TokenSelector.tsx
"use client";
import { usePerps } from "@/contexts/PerpsContext";
import { usePriceStore } from "@/contexts/PriceStoreContext";
import { useUserContext } from "@/contexts/UserContext";
import { useState, useMemo } from "react";
import { Search, ArrowUp, ArrowDown, TrendingUp, TrendingDown } from "lucide-react";
import styles from "./styles/TokenSelector.module.css";

interface TokenSelectorProps {
  onSelectToken: (token: any) => void;
  selectedSymbol?: string;
}

export default function TokenSelector({ onSelectToken, selectedSymbol }: TokenSelectorProps) {
  const { activeTokens, loading: perpsLoading } = usePerps();
  const { priceMap, loading: priceLoading } = usePriceStore();
  const { isInWatchlist, toggleWatchlistToken } = useUserContext();
  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: 'marketCap', direction: 'desc' });

  const filteredAndSortedTokens = useMemo(() => {
    let filtered = activeTokens;
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(t => 
        t.symbol.toLowerCase().includes(term) ||
        t.name.toLowerCase().includes(term)
      );
    }

    return [...filtered].sort((a, b) => {
      const aPrice = priceMap[a.symbol]?.price || 0;
      const bPrice = priceMap[b.symbol]?.price || 0;
      const aChange = (priceMap[a.symbol] as any)?.change24h || 0;
      const bChange = (priceMap[b.symbol] as any)?.change24h || 0;
      const aCap = (priceMap[a.symbol] as any)?.marketCap || 0;
      const bCap = (priceMap[b.symbol] as any)?.marketCap || 0;

      let aVal, bVal;
      switch(sortConfig.key) {
        case 'symbol':
          aVal = a.symbol;
          bVal = b.symbol;
          break;
        case 'price':
          aVal = aPrice;
          bVal = bPrice;
          break;
        case 'change':
          aVal = aChange;
          bVal = bChange;
          break;
        case 'marketCap':
          aVal = aCap;
          bVal = bCap;
          break;
        default:
          aVal = aCap;
          bVal = bCap;
      }

      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [activeTokens, priceMap, searchTerm, sortConfig]);

  const handleSort = (key: string) => {
    setSortConfig({
      key,
      direction: sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc'
    });
  };

  const getSortIcon = (key: string) => {
    if (sortConfig.key !== key) return <span className={styles.sortIconPlaceholder}>↕️</span>;
    return sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
  };

  const formatPrice = (price: number) => {
    if (!price) return '$0.00';
    if (price < 0.01) return `$${price.toFixed(6)}`;
    if (price < 1) return `$${price.toFixed(4)}`;
    return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatMarketCap = (marketCap: number) => {
    if (!marketCap) return '—';
    if (marketCap >= 1e9) return `$${(marketCap / 1e9).toFixed(2)}B`;
    if (marketCap >= 1e6) return `$${(marketCap / 1e6).toFixed(2)}M`;
    if (marketCap >= 1e3) return `$${(marketCap / 1e3).toFixed(2)}K`;
    return `$${marketCap.toFixed(2)}`;
  };

  if (perpsLoading || priceLoading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingSpinner}></div>
        <div className={styles.loadingText}>Loading markets...</div>
      </div>
    );
  }

  return (
    <div className={styles.tokenSelector}>
      <div className={styles.header}>
        <h2 className={styles.title}>Perpetual Markets</h2>
        <div className={styles.stats}>
          <span className={styles.statItem}>
            <span className={styles.statLabel}>Markets</span>
            <span className={styles.statValue}>{activeTokens.length}</span>
          </span>
        </div>
      </div>

      {/* Search Bar */}
      <div className={styles.searchContainer}>
        <Search size={16} className={styles.searchIcon} />
        <input
          type="text"
          placeholder="Search by symbol or name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={styles.searchInput}
        />
      </div>

      {/* Table */}
      <div className={styles.tableWrapper}>
        <table className={styles.tokenTable}>
          <thead>
            <tr>
              <th onClick={() => handleSort('symbol')} className={styles.sortable}>
                <span className={styles.headerLabelWrap}>
                  Futures {getSortIcon('symbol')}
                </span>
              </th>
              <th onClick={() => handleSort('price')} className={`${styles.sortable} ${styles.rightHeader}`}>
                <span className={`${styles.headerLabelWrap} ${styles.rightHeaderLabel}`}>
                  Price {getSortIcon('price')}
                </span>
              </th>
              <th onClick={() => handleSort('change')} className={`${styles.sortable} ${styles.rightHeader}`}>
                <span className={`${styles.headerLabelWrap} ${styles.rightHeaderLabel}`}>
                  24h Change {getSortIcon('change')}
                </span>
              </th>
              <th onClick={() => handleSort('marketCap')} className={`${styles.sortable} ${styles.rightHeader}`}>
                <span className={`${styles.headerLabelWrap} ${styles.rightHeaderLabel}`}>
                  Market Cap {getSortIcon('marketCap')}
                </span>
              </th>
              <th className={styles.centerHeader}>Watch</th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedTokens.map((token) => {
              const priceData = priceMap[token.symbol] as any;
              const price = priceData?.price || 0;
              const change24h = priceData?.change24h || 0;
              const marketCap = priceData?.marketCap || 0;
              const isSelected = selectedSymbol === token.symbol;
              const isPositive = change24h >= 0;

              return (
                <tr
                  key={token.symbol}
                  className={`${styles.tokenRow} ${isSelected ? styles.selected : ''}`}
                  onClick={() => onSelectToken(token)}
                >
                  {/* Token Column */}
                  <td className={styles.tokenCell}>
                    <div className={styles.tokenInfo}>
                      {token.icon_url ? (
                        <img src={token.icon_url} alt={token.symbol} className={styles.tokenIcon} />
                      ) : (
                        <div className={styles.tokenIconPlaceholder}>
                          {token.symbol.charAt(0)}
                        </div>
                      )}
                      <div>
                        <div className={styles.tokenSymbolRow}>
                          <div className={styles.tokenSymbol}>{token.symbol}</div>
                          <span className={styles.inlineLeverageBadge}>{token.max_leverage}x</span>
                        </div>
                        <div className={styles.tokenName}>{token.name}</div>
                      </div>
                    </div>
                  </td>
                  
                  {/* Price Column */}
                  <td className={`${styles.priceCell} ${styles.rightCell}`}>
                    {formatPrice(price)}
                  </td>
                  
                  {/* Change Column */}
                  <td className={styles.rightCell}>
                    <div className={`${styles.changeBadge} ${isPositive ? styles.positive : styles.negative}`}>
                      {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {isPositive ? '+' : ''}{change24h.toFixed(2)}%
                    </div>
                  </td>
                  
                  {/* Market Cap Column */}
                  <td className={`${styles.marketCapCell} ${styles.rightCell}`}>
                    {formatMarketCap(marketCap)}
                  </td>

                  {/* Watchlist Column */}
                  <td className={styles.centerCell}>
                    <button
                      type="button"
                      className={`${styles.watchButton} ${isInWatchlist(token.symbol) ? styles.watchButtonActive : ''}`}
                      title={isInWatchlist(token.symbol) ? "Remove from watchlist" : "Add to watchlist"}
                      onClick={async (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        await toggleWatchlistToken(token.symbol);
                      }}
                    >
                      <svg className={styles.watchIcon} viewBox="0 0 24 24" fill={isInWatchlist(token.symbol) ? "currentColor" : "none"}>
                        <path d="M12 4L14.5 9.5L20.5 10.5L16.5 14.5L17.5 20.5L12 17.5L6.5 20.5L7.5 14.5L3.5 10.5L9.5 9.5L12 4Z" stroke="currentColor" strokeWidth="1.5" />
                      </svg>
                    </button>
                  </td>
                </tr>
              );
            })}
            {filteredAndSortedTokens.length === 0 && (
              <tr>
                <td colSpan={5} className={styles.noResults}>
                  No matching markets found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className={styles.footer}>
        <span>Showing {filteredAndSortedTokens.length} of {activeTokens.length} markets</span>
      </div>
    </div>
  );
}