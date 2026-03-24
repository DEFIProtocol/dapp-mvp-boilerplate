// app/account/components/Watchlist.tsx
"use client";

import { useRouter } from "next/navigation";
import { TrendingUp, TrendingDown } from "lucide-react";
import styles from "./styles/Watchlist.module.css";

interface WatchlistProps {
  watchlist: any[];
  tokens: any[];
  selectedChain: number;
}

export function Watchlist({ watchlist, tokens, selectedChain }: WatchlistProps) {
  const router = useRouter();

  const getTokenInfo = (symbol: string) => {
    return tokens?.find(t => t.symbol?.toUpperCase() === symbol.toUpperCase());
  };

  const getTokenIcon = (symbol: string) => {
    const token = getTokenInfo(symbol);
    if (token?.image) return token.image;
    return null;
  };

  const handleTokenClick = (symbol: string) => {
    const token = getTokenInfo(symbol);
    if (token?.uuid) {
      router.push(`/tokens/${token.uuid}`);
    }
  };

  if (!watchlist?.length) {
    return (
      <div className={styles.watchlistCard}>
        <div className={styles.watchlistHeader}>
          <h2>Watchlist</h2>
          <span className={styles.watchlistCount}>0</span>
        </div>
        <div className={styles.emptyWatchlist}>
          <div className={styles.emptyIcon}>⭐</div>
          <p className={styles.emptyTitle}>No Watchlist Items</p>
          <p className={styles.emptyHint}>Add tokens to your watchlist to track them here</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.watchlistCard}>
      <div className={styles.watchlistHeader}>
        <h2>Watchlist</h2>
        <span className={styles.watchlistCount}>{watchlist.length}</span>
      </div>
      <div className={styles.watchlistItems}>
        {watchlist.map((item, index) => {
          const tokenIcon = getTokenIcon(item.symbol);
          const tokenInfo = getTokenInfo(item.symbol);
          const price = tokenInfo?.price || 0;
          const change = tokenInfo?.change24h || 0;
          const isPositive = change >= 0;
          
          return (
            <div
              key={index}
              className={styles.watchlistRow}
              onClick={() => handleTokenClick(item.symbol)}
            >
              <div className={styles.tokenLeft}>
                <div className={styles.tokenIcon}>
                  {tokenIcon ? (
                    <img src={tokenIcon} alt={item.symbol} />
                  ) : (
                    item.symbol?.charAt(0) || "?"
                  )}
                </div>
                <div className={styles.tokenDetails}>
                  <div className={styles.tokenSymbol}>{item.symbol}</div>
                  <div className={styles.tokenName}>{tokenInfo?.name || item.symbol}</div>
                </div>
              </div>
              <div className={styles.tokenStats}>
                <div className={styles.tokenPrice}>${price.toFixed(2)}</div>
                <div className={`${styles.tokenChange} ${isPositive ? styles.positive : styles.negative}`}>
                  {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  <span>{isPositive ? '+' : ''}{change.toFixed(2)}%</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}