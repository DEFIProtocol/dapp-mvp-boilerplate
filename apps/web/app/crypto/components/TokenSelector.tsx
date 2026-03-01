// app/crypto/components/TokenSelector.tsx
"use client";
import { usePerps } from "@/contexts/PerpsContext";
import { usePriceStore } from "@/contexts/PriceStoreContext";
import { useState, useMemo } from "react";
import styles from "./styles/TokenSelector.module.css";

interface TokenSelectorProps {
  onSelectToken: (token: any) => void;
  selectedSymbol?: string;
}

export default function TokenSelector({ onSelectToken, selectedSymbol }: TokenSelectorProps) {
  const { activeTokens, loading: perpsLoading } = usePerps();
  const { priceMap, loading: priceLoading } = usePriceStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: 'marketCap', direction: 'desc' });

  const filteredAndSortedTokens = useMemo(() => {
    let filtered = activeTokens;
    
    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(t => 
        t.symbol.toLowerCase().includes(term) ||
        t.name.toLowerCase().includes(term)
      );
    }

    // Apply sorting
    return [...filtered].sort((a, b) => {
      const aPrice = priceMap[a.symbol]?.price || 0;
      const bPrice = priceMap[b.symbol]?.price || 0;
      const aChange = (priceMap[a.symbol] && 'change24h' in priceMap[a.symbol] ? (priceMap[a.symbol] as any).change24h : 0) || 0;
      const bChange = (priceMap[b.symbol] && 'change24h' in priceMap[b.symbol] ? (priceMap[b.symbol] as any).change24h : 0) || 0;
      const aCap = (priceMap[a.symbol] && 'marketCap' in priceMap[a.symbol] ? (priceMap[a.symbol] as any).marketCap : 0) || 0;
      const bCap = (priceMap[b.symbol] && 'marketCap' in priceMap[b.symbol] ? (priceMap[b.symbol] as any).marketCap : 0) || 0;

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
    if (sortConfig.key !== key) return '↕️';
    return sortConfig.direction === 'asc' ? '↑' : '↓';
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
        <input
          type="text"
          placeholder="🔍 Search by symbol or name..."
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
                Token {getSortIcon('symbol')}
              </th>
              <th onClick={() => handleSort('price')} className={styles.sortable}>
                Price {getSortIcon('price')}
              </th>
              <th onClick={() => handleSort('change')} className={styles.sortable}>
                24h Change {getSortIcon('change')}
              </th>
              <th onClick={() => handleSort('marketCap')} className={styles.sortable}>
                Market Cap {getSortIcon('marketCap')}
              </th>
              <th>Max Lev</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedTokens.map((token) => {
              const priceData = priceMap[token.symbol];
              const price = priceData?.price || 0;
              const change24h = (priceData && 'change24h' in priceData ? (priceData as any).change24h : 0) || 0;
              const marketCap = (priceData && 'marketCap' in priceData ? (priceData as any).marketCap : 0) || 0;
              const isSelected = selectedSymbol === token.symbol;

              // Format market cap
              let marketCapStr = '—';
              if (marketCap > 0) {
                if (marketCap >= 1e9) marketCapStr = `$${(marketCap / 1e9).toFixed(2)}B`;
                else if (marketCap >= 1e6) marketCapStr = `$${(marketCap / 1e6).toFixed(2)}M`;
                else marketCapStr = `$${marketCap.toLocaleString()}`;
              }

              return (
                <tr
                  key={token.symbol}
                  className={`${styles.tokenRow} ${isSelected ? styles.selected : ''}`}
                  onClick={() => onSelectToken(token)}
                >
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
                        <div className={styles.tokenSymbol}>{token.symbol}</div>
                        <div className={styles.tokenName}>{token.name}</div>
                      </div>
                    </div>
                  </td>
                  <td className={styles.priceCell}>
                    ${price.toFixed(price < 0.01 ? 6 : 2)}
                  </td>
                  <td>
                    <span className={`${styles.changeCell} ${change24h >= 0 ? styles.positive : styles.negative}`}>
                      {change24h > 0 ? '▲' : change24h < 0 ? '▼' : ''}
                      {change24h !== 0 ? ` ${Math.abs(change24h).toFixed(2)}%` : '0.00%'}
                    </span>
                  </td>
                  <td className={styles.marketCapCell}>{marketCapStr}</td>
                  <td>
                    <span className={styles.leverageBadge}>{token.max_leverage}x</span>
                  </td>
                  <td>
                    <span className={`${styles.statusBadge} ${token.is_active ? styles.active : ''}`}>
                      {token.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              );
            })}
            {filteredAndSortedTokens.length === 0 && (
              <tr>
                <td colSpan={6} className={styles.noResults}>
                  No matching markets found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer with count */}
      <div className={styles.footer}>
        <span>Showing {filteredAndSortedTokens.length} of {activeTokens.length} markets</span>
      </div>
    </div>
  );
}