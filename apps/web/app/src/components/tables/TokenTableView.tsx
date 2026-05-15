"use client";

import Link from "next/link";
import type { ReactNode } from "react";

type SortKey = "symbol" | "price" | "marketCap" | "change24h";

export interface TokenTableRow {
  key: string;
  symbol: string;
  name: string;
  image?: string;
  href?: string;
  price: number | null;
  marketCap: number | null;
  change24h: number | null;
}

interface TokenTableViewProps {
  styles: Record<string, string>;
  rows: TokenTableRow[];
  isLoading?: boolean;
  skeletonRows?: number;
  emptyTitle: string;
  emptyHint: ReactNode;
  countLabel?: string;
  sortKey?: SortKey;
  getSortMarker?: (key: SortKey) => string;
  onSort?: (key: SortKey) => void;
  isInWatchlist: (symbol: string) => boolean;
  onToggleWatchlist: (symbol: string, event: React.MouseEvent<HTMLButtonElement>) => Promise<void> | void;
  formatPrice: (value: number | null) => string;
  formatMarketCap: (value: number | null) => string;
  firstColumnLabel?: string;
  fourthColumnLabel?: string;
}

const FALLBACK_TEXT = "—";

export default function TokenTableView({
  styles,
  rows,
  isLoading = false,
  skeletonRows = 8,
  emptyTitle,
  emptyHint,
  sortKey,
  getSortMarker,
  onSort,
  isInWatchlist,
  onToggleWatchlist,
  formatPrice,
  formatMarketCap,
  firstColumnLabel = "Token",
  fourthColumnLabel = "Market Cap",
}: TokenTableViewProps) {
  const renderSortHeader = (key: SortKey, label: string, numeric = false) => {
    if (!onSort || !getSortMarker || !sortKey) {
      return <span>{label}</span>;
    }

    return (
      <button
        type="button"
        className={`${styles.sortButton} ${numeric ? styles.sortButtonNumeric : ""} ${sortKey === key ? styles.sortButtonActive : ""}`}
        onClick={() => onSort(key)}
      >
        <span>{label}</span>
        <span className={styles.sortMarker}>{getSortMarker(key)}</span>
      </button>
    );
  };

  return (
    <div className={`${styles.tableWrapper} responsive-scroll`}>
      <table className={styles.tokensTable}>
        <caption className={styles.tableCaption}>Token market overview</caption>
        <colgroup>
          <col className={styles.tokenColumn} />
          <col className={styles.numericColumn} />
          <col className={styles.numericColumn} />
          <col className={styles.numericColumn} />
          <col className={styles.watchColumn} />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">{renderSortHeader("symbol", firstColumnLabel)}</th>
            <th scope="col" className={styles.numericHeader}>{renderSortHeader("price", "Price", true)}</th>
            <th scope="col" className={styles.numericHeader}>{renderSortHeader("change24h", "24h", true)}</th>
            <th scope="col" className={styles.numericHeader}>{renderSortHeader("marketCap", fourthColumnLabel, true)}</th>
            <th scope="col" className={styles.watchHeader}></th>
          </tr>
        </thead>
        <tbody>
          {isLoading && rows.length === 0 ? (
            Array.from({ length: skeletonRows }).map((_, index) => (
              <tr key={`skeleton-${index}`} className={styles.skeletonRow}>
                <td>
                  <div className={styles.skeletonTokenCell}>
                    <span className={styles.skeletonIcon} />
                    <div className={styles.skeletonTextCol}>
                      <span className={styles.skeletonName} />
                      <span className={styles.skeletonSubline} />
                    </div>
                  </div>
                </td>
                <td className={styles.numericCell}><span className={styles.skeletonValue} /></td>
                <td className={styles.numericCell}><span className={styles.skeletonBadge} /></td>
                <td className={styles.numericCell}><span className={styles.skeletonValue} /></td>
                <td className={styles.watchCell}><span className={styles.skeletonWatch} /></td>
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={5} className={styles.emptyState}>
                <div className={styles.emptyIcon}>🔍</div>
                <p className={styles.emptyTitle}>{emptyTitle}</p>
                <p className={styles.emptyHint}>{emptyHint}</p>
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.key} className={styles.tokenRow}>
                <td className={styles.symbolCell}>
                  <div className={styles.tokenInfo}>
                    <div className={styles.tokenLogoWrap}>
                      {row.image ? (
                        <img src={row.image} alt={row.symbol} className={styles.tokenIcon} />
                      ) : (
                        <span className={styles.tokenIconFallback}>{row.symbol.slice(0, 1) || "?"}</span>
                      )}
                    </div>
                    <div className={styles.tokenDetails}>
                      {row.href ? (
                        <Link href={row.href} className={styles.tokenName}>
                          {row.name || row.symbol || FALLBACK_TEXT}
                        </Link>
                      ) : (
                        <span className={styles.tokenName}>{row.name || row.symbol || FALLBACK_TEXT}</span>
                      )}
                      <div className={styles.tokenSymbol}>{row.symbol || FALLBACK_TEXT}</div>
                    </div>
                  </div>
                </td>
                <td className={`${styles.priceCell} ${styles.numericCell}`}>
                  <span className={styles.priceValue}>{formatPrice(row.price)}</span>
                </td>
                <td className={styles.numericCell}>
                  {row.change24h === null ? (
                    FALLBACK_TEXT
                  ) : (
                    <span className={`${styles.changeBadge} ${row.change24h >= 0 ? styles.changePositive : styles.changeNegative}`}>
                      {row.change24h > 0 ? "+" : ""}
                      {row.change24h.toFixed(2)}%
                    </span>
                  )}
                </td>
                <td className={styles.numericCell}>
                  <span className={styles.marketCapValue}>{formatMarketCap(row.marketCap)}</span>
                </td>
                <td className={styles.watchCell}>
                  <button
                    type="button"
                    className={`${styles.watchButton} ${isInWatchlist(row.symbol) ? styles.watchButtonActive : ""}`}
                    title={isInWatchlist(row.symbol) ? "Remove from watchlist" : "Add to watchlist"}
                    onClick={(event) => onToggleWatchlist(row.symbol, event)}
                  >
                    <svg className={styles.watchIcon} viewBox="0 0 24 24" fill={isInWatchlist(row.symbol) ? "currentColor" : "none"}>
                      <path d="M12 4L14.5 9.5L20.5 10.5L16.5 14.5L17.5 20.5L12 17.5L6.5 20.5L7.5 14.5L3.5 10.5L9.5 9.5L12 4Z" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
