// app/account/components/Holdings.tsx
"use client";

import { useRouter } from "next/navigation";
import styles from "./styles/Holdings.module.css";

interface HoldingsProps {
  holdings: any[];
  tokens: any[];
  loading: boolean;
  error: string | null;
  selectedChain: number;
}

export function Holdings({ holdings, tokens, loading, error, selectedChain }: HoldingsProps) {
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

  if (loading) {
    return (
      <div className={styles.holdingsCard}>
        <div className={styles.cardHeader}>
          <h2>Holdings</h2>
        </div>
        <div className={styles.loadingContainer}>
          <div className={styles.loadingSpinner} />
          <p className={styles.loadingText}>Loading holdings...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.holdingsCard}>
        <div className={styles.cardHeader}>
          <h2>Holdings</h2>
        </div>
        <div className={styles.errorContainer}>
          <p className={styles.errorText}>{error}</p>
        </div>
      </div>
    );
  }

  if (!holdings.length) {
    return (
      <div className={styles.holdingsCard}>
        <div className={styles.cardHeader}>
          <h2>Holdings</h2>
        </div>
        <div className={styles.emptyContainer}>
          <div className={styles.emptyIcon}>💰</div>
          <p className={styles.emptyTitle}>No Holdings</p>
          <p className={styles.emptyHint}>Your token holdings will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.holdingsCard}>
      <div className={styles.cardHeader}>
        <h2>Holdings</h2>
        <span className={styles.totalValue}>Total: $0.00</span>
      </div>
      <div className={styles.holdingsList}>
        {holdings.map((holding, index) => {
          const tokenIcon = getTokenIcon(holding.symbol);
          const tokenInfo = getTokenInfo(holding.symbol);
          
          return (
            <div
              key={index}
              className={styles.holdingRow}
              onClick={() => handleTokenClick(holding.symbol)}
            >
              <div className={styles.holdingLeft}>
                <div className={styles.tokenIcon}>
                  {tokenIcon ? (
                    <img src={tokenIcon} alt={holding.symbol} />
                  ) : (
                    holding.symbol?.charAt(0) || "?"
                  )}
                </div>
                <div className={styles.tokenInfo}>
                  <div className={styles.tokenSymbol}>{holding.symbol}</div>
                  <div className={styles.tokenName}>{tokenInfo?.name || holding.symbol}</div>
                </div>
              </div>
              <div className={styles.holdingRight}>
                <div className={styles.tokenBalance}>
                  {holding.balance} {holding.symbol}
                </div>
                <div className={styles.tokenValue}>≈ $0.00</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}