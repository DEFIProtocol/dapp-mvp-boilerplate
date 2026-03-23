// tokens/components/TokensTable.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTokens } from "@/contexts/TokenContext";
import { usePriceStore } from "@/contexts/PriceStoreContext";
import { useChainContext } from "@/contexts/ChainContext";
import styles from "../TokensPage.module.css";

type SortKey = "symbol" | "price" | "marketCap" | "change24h";
type SortDirection = "asc" | "desc";

interface MergedToken {
  uuid: string;
  symbol: string;
  name: string;
  image?: string;
  price: number | null;
  marketCap: number | null;
  change24h: number | null;
}

const FALLBACK_TEXT = "—";

const CHAIN_KEY_MAP: Record<string, string[]> = {
  "8453": ["base"],
  "1": ["ethereum"],
  "56": ["bnb", "bsc"],
  "137": ["polygon"],
  "43114": ["avalanche"],
  "42161": ["arbitrum"],
  "501": ["solana"],
};

const formatPrice = (value: number | null) => {
  if (value === null || Number.isNaN(value)) return FALLBACK_TEXT;
  if (value < 0.01) {
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 6 })}`;
  }
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
};

const formatMarketCap = (value: number | null) => {
  if (value === null || Number.isNaN(value)) return FALLBACK_TEXT;
  if (value >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
};

const normalizeChains = (rawChains: unknown): Record<string, unknown> => {
  if (!rawChains) return {};
  if (typeof rawChains === "string") {
    try {
      return JSON.parse(rawChains) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof rawChains === "object") {
    return rawChains as Record<string, unknown>;
  }
  return {};
};

export default function TokensTable() {
  const { tokens, loading: tokensLoading } = useTokens();
  const { priceMap, loading: pricesLoading, error: pricesError } = usePriceStore();
  const { selectedChain, getChainSlug } = useChainContext();

  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("marketCap");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const mergedTokens = useMemo<MergedToken[]>(() => {
    const chainKey = String(selectedChain || "");
    const aliasKeys = CHAIN_KEY_MAP[chainKey] || [];

    const merged: MergedToken[] = [];

    for (const token of tokens) {
      const chains = normalizeChains(token.chains);
      const chainMatch = Boolean(chains[chainKey] || aliasKeys.some((key) => Boolean(chains[key])));
      if (!chainMatch) continue;

      const symbol = (token.symbol || "").toUpperCase();
      if (!symbol) continue;

      const priceEntry = priceMap[symbol];

      const fallbackPrice =
        typeof token.price === "number"
          ? token.price
          : typeof token.price === "string"
            ? Number(token.price)
            : null;

      const rawMarketCap = (token as { market_cap?: unknown; marketCap?: unknown }).market_cap
        ?? (token as { market_cap?: unknown; marketCap?: unknown }).marketCap;
      const marketCap =
        typeof priceEntry?.marketCap === "number"
          ? priceEntry.marketCap
          : typeof rawMarketCap === "number"
            ? rawMarketCap
            : typeof rawMarketCap === "string"
              ? Number(rawMarketCap)
              : null;

      const rawChange = (token as { change?: unknown }).change;
      const change24h =
        typeof priceEntry?.change24h === "number"
          ? priceEntry.change24h
          : typeof rawChange === "number"
            ? rawChange
            : typeof rawChange === "string"
              ? Number(rawChange)
              : null;

      merged.push({
        uuid: token.uuid || "",
        symbol,
        name: token.name || symbol,
        image: token.image,
        price: priceEntry?.price ?? (Number.isFinite(fallbackPrice ?? NaN) ? fallbackPrice : null),
        marketCap: Number.isFinite(marketCap ?? NaN) ? marketCap : null,
        change24h: Number.isFinite(change24h ?? NaN) ? change24h : null,
      });
    }

    return merged;
  }, [tokens, priceMap, selectedChain]);

  const filteredTokens = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    const filtered = term
      ? mergedTokens.filter((token) => {
          return (
            token.symbol.toLowerCase().includes(term) ||
            token.name.toLowerCase().includes(term) ||
            token.uuid.toLowerCase().includes(term)
          );
        })
      : mergedTokens;

    return [...filtered].sort((left, right) => {
      let comparison = 0;

      if (sortKey === "price") {
        comparison = (left.price ?? -1) - (right.price ?? -1);
      } else if (sortKey === "marketCap") {
        comparison = (left.marketCap ?? -1) - (right.marketCap ?? -1);
      } else if (sortKey === "change24h") {
        comparison = (left.change24h ?? -999999) - (right.change24h ?? -999999);
      } else {
        const leftValue = left.symbol.toLowerCase();
        const rightValue = right.symbol.toLowerCase();
        comparison = leftValue.localeCompare(rightValue);
      }

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [mergedTokens, searchTerm, sortDirection, sortKey]);

  const isLoading = tokensLoading || pricesLoading;
  const skeletonRows = 8;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDirection(key === "symbol" ? "asc" : "desc");
  };

  const getSortMarker = (key: SortKey) => {
    if (sortKey !== key) return "↕";
    return sortDirection === "asc" ? "↑" : "↓";
  };

  return (
    <section className={styles.tableCard}>
      <div className={styles.toolbar}>
        <div className={styles.searchWrapper}>
          <svg className={styles.searchIcon} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 17C13.4183 17 17 13.4183 17 9C17 4.58172 13.4183 1 9 1C4.58172 1 1 4.58172 1 9C1 13.4183 4.58172 17 9 17Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M19 19L14 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <input
            className={styles.searchInput}
            type="text"
            placeholder="Search tokens..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>
        <div className={styles.countBadge}>
          <span className={styles.countNumber}>{filteredTokens.length}</span>
          <span className={styles.countLabel}>tokens</span>
        </div>
      </div>

      {pricesError && (
        <div className={styles.errorContainer}>
          <svg className={styles.errorIcon} viewBox="0 0 20 20" fill="none">
            <path d="M10 6V10M10 14H10.01M19 10C19 14.9706 14.9706 19 10 19C5.02944 19 1 14.9706 1 10C1 5.02944 5.02944 1 10 1C14.9706 1 19 5.02944 19 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span>Price feed error: {pricesError}</span>
        </div>
      )}

      <div className={styles.tableWrapper}>
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
              <th scope="col">
                <button
                  type="button"
                  className={`${styles.sortButton} ${sortKey === "symbol" ? styles.sortButtonActive : ""}`}
                  onClick={() => handleSort("symbol")}
                >
                  <span>Token</span>
                  <span className={styles.sortMarker}>{getSortMarker("symbol")}</span>
                </button>
              </th>
              <th scope="col" className={styles.numericHeader}>
                <button
                  type="button"
                  className={`${styles.sortButton} ${styles.sortButtonNumeric} ${sortKey === "price" ? styles.sortButtonActive : ""}`}
                  onClick={() => handleSort("price")}
                >
                  <span>Price</span>
                  <span className={styles.sortMarker}>{getSortMarker("price")}</span>
                </button>
              </th>
              <th scope="col" className={styles.numericHeader}>
                <button
                  type="button"
                  className={`${styles.sortButton} ${styles.sortButtonNumeric} ${sortKey === "change24h" ? styles.sortButtonActive : ""}`}
                  onClick={() => handleSort("change24h")}
                >
                  <span>24h</span>
                  <span className={styles.sortMarker}>{getSortMarker("change24h")}</span>
                </button>
              </th>
              <th scope="col" className={styles.numericHeader}>
                <button
                  type="button"
                  className={`${styles.sortButton} ${styles.sortButtonNumeric} ${sortKey === "marketCap" ? styles.sortButtonActive : ""}`}
                  onClick={() => handleSort("marketCap")}
                >
                  <span>Market Cap</span>
                  <span className={styles.sortMarker}>{getSortMarker("marketCap")}</span>
                </button>
              </th>
              <th scope="col" className={styles.watchHeader}></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && filteredTokens.length === 0 ? (
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
            ) : filteredTokens.length === 0 ? (
              <tr>
                <td colSpan={5} className={styles.emptyState}>
                  <div className={styles.emptyIcon}>🔍</div>
                  <p className={styles.emptyTitle}>No tokens found</p>
                  <p className={styles.emptyHint}>Try adjusting your search or chain selection</p>
                </td>
              </tr>
            ) : (
              filteredTokens.map((token) => (
                <tr key={`${token.symbol}-${token.uuid}`} className={styles.tokenRow}>
                  <td className={styles.symbolCell}>
                    <div className={styles.tokenInfo}>
                      <div className={styles.tokenLogoWrap}>
                        {token.image ? (
                          <img src={token.image} alt={token.symbol} className={styles.tokenIcon} />
                        ) : (
                          <span className={styles.tokenIconFallback}>{token.symbol.slice(0, 1) || "?"}</span>
                        )}
                      </div>
                      <div className={styles.tokenDetails}>
                        {token.uuid ? (
                          <Link href={`/market/${getChainSlug(selectedChain)}/${token.uuid}`} className={styles.tokenName}>
                            {token.name || token.symbol || FALLBACK_TEXT}
                          </Link>
                        ) : (
                          <span className={styles.tokenName}>{token.name || token.symbol || FALLBACK_TEXT}</span>
                        )}
                        <div className={styles.tokenSymbol}>{token.symbol || FALLBACK_TEXT}</div>
                      </div>
                    </div>
                  </td>
                  <td className={`${styles.priceCell} ${styles.numericCell}`}>
                    <span className={styles.priceValue}>{formatPrice(token.price)}</span>
                  </td>
                  <td className={styles.numericCell}>
                    {token.change24h === null ? (
                      FALLBACK_TEXT
                    ) : (
                      <span
                        className={`${styles.changeBadge} ${
                          token.change24h >= 0 ? styles.changePositive : styles.changeNegative
                        }`}
                      >
                        {token.change24h > 0 ? "+" : ""}
                        {token.change24h.toFixed(2)}%
                      </span>
                    )}
                  </td>
                  <td className={styles.numericCell}>
                    <span className={styles.marketCapValue}>{formatMarketCap(token.marketCap)}</span>
                  </td>
                  <td className={styles.watchCell}>
                    <button
                      type="button"
                      className={styles.watchButton}
                      title="Add to watchlist"
                      disabled
                    >
                      <svg className={styles.watchIcon} viewBox="0 0 24 24" fill="none">
                        <path d="M12 4L14.5 9.5L20.5 10.5L16.5 14.5L17.5 20.5L12 17.5L6.5 20.5L7.5 14.5L3.5 10.5L9.5 9.5L12 4Z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                      </svg>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}