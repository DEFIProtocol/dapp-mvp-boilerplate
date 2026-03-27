// tokens/components/TokensTable.tsx
"use client";

import { useMemo, useState } from "react";
import { useTokens } from "@/contexts/TokenContext";
import { usePriceStore } from "@/contexts/PriceStoreContext";
import { useChainContext } from "@/contexts/ChainContext";
import { useUserContext } from "@/contexts/UserContext";
import TokenTableView, { TokenTableRow } from "@/components/tables/TokenTableView";
import styles from "../TokensPage.module.css";

type SortKey = "symbol" | "price" | "marketCap" | "change24h";
type SortDirection = "asc" | "desc";

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
  const { isInWatchlist, toggleWatchlistToken } = useUserContext();

  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("marketCap");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const mergedTokens = useMemo<TokenTableRow[]>(() => {
    const chainKey = String(selectedChain || "");
    const aliasKeys = CHAIN_KEY_MAP[chainKey] || [];

    const merged: TokenTableRow[] = [];

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
        key: `${symbol}-${token.uuid || ""}`,
        symbol,
        name: token.name || symbol,
        image: token.image,
        href: token.uuid ? `/market/${getChainSlug(selectedChain)}/${token.uuid}` : undefined,
        price: priceEntry?.price ?? (Number.isFinite(fallbackPrice ?? NaN) ? fallbackPrice : null),
        marketCap: Number.isFinite(marketCap ?? NaN) ? marketCap : null,
        change24h: Number.isFinite(change24h ?? NaN) ? change24h : null,
      });
    }

    return merged;
  }, [tokens, priceMap, selectedChain, getChainSlug]);

  const filteredTokens = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    const filtered = term
      ? mergedTokens.filter((token) => {
          return (
            token.symbol.toLowerCase().includes(term) ||
            token.name.toLowerCase().includes(term) ||
            token.key.toLowerCase().includes(term)
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
      <TokenTableView
        styles={styles}
        rows={filteredTokens}
        isLoading={isLoading}
        skeletonRows={skeletonRows}
        emptyTitle="No tokens found"
        emptyHint="Try adjusting your search or chain selection"
        sortKey={sortKey}
        getSortMarker={getSortMarker}
        onSort={handleSort}
        isInWatchlist={isInWatchlist}
        onToggleWatchlist={async (symbol, event) => {
          event.preventDefault();
          event.stopPropagation();
          await toggleWatchlistToken(symbol);
        }}
        formatPrice={formatPrice}
        formatMarketCap={formatMarketCap}
      />
    </section>
  );
}