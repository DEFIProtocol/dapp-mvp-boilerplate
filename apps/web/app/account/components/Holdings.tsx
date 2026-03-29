// app/account/components/Holdings.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useChainContext } from "@/contexts/ChainContext";
import { usePriceStore } from "@/contexts/PriceStoreContext";
import { useUserContext } from "@/contexts/UserContext";
import TokenTableView, { TokenTableRow } from "@/components/tables/TokenTableView";
import tableStyles from "../../tokens/TokensPage.module.css";
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
  const { getChainSlug } = useChainContext();
  const { priceMap } = usePriceStore();
  const { isInWatchlist, toggleWatchlistToken } = useUserContext();
  const [page, setPage] = useState(1);
  const pageSize = 5;

  const getTokenInfo = (symbol: string) => {
    return tokens?.find(t => t.symbol?.toUpperCase() === symbol.toUpperCase());
  };

  const allRows = useMemo<TokenTableRow[]>(() => {
    const rows: TokenTableRow[] = [];

    (holdings || []).forEach((holding, index) => {
      const symbol = String(holding?.symbol || "").trim().toUpperCase();
      if (!symbol) return;

      const token = getTokenInfo(symbol);
      const priceEntry = priceMap[symbol] as any;

      const rawAmount = Number(holding?.balance ?? 0);
      const amount = Number.isFinite(rawAmount) ? rawAmount : 0;
      const unitPrice = typeof priceEntry?.price === "number" ? priceEntry.price : null;
      const value = unitPrice !== null ? amount * unitPrice : null;

      rows.push({
        key: `holding-${holding?.address || symbol}-${index}`,
        symbol,
        name: token?.name || holding?.name || symbol,
        image: token?.image,
        href: token?.uuid ? `/market/${getChainSlug(selectedChain)}/${token.uuid}` : undefined,
        price: unitPrice,
        marketCap: value,
        change24h: typeof priceEntry?.change24h === "number" ? priceEntry.change24h : null,
      });
    });

    return rows.sort((left, right) => (right.marketCap ?? -1) - (left.marketCap ?? -1));
  }, [holdings, priceMap, selectedChain, getChainSlug, tokens]);

  useEffect(() => {
    setPage(1);
  }, [allRows.length]);

  const totalPages = Math.max(1, Math.ceil(allRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return allRows.slice(start, start + pageSize);
  }, [allRows, currentPage]);

  const startItem = allRows.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, allRows.length);

  const totalValue = useMemo(() => {
    const sum = allRows.reduce((acc, row) => acc + (row.marketCap ?? 0), 0);
    return sum;
  }, [allRows]);

  const formatPrice = (value: number | null) => {
    if (value === null || Number.isNaN(value)) return "—";
    if (value < 0.01) return `$${value.toLocaleString(undefined, { maximumFractionDigits: 6 })}`;
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  };

  const formatValue = (value: number | null) => {
    if (value === null || Number.isNaN(value)) return "—";
    if (value >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
    if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  };

  const handleToggleWatchlist = async (symbol: string, event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    await toggleWatchlistToken(symbol);
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
        <span className={styles.totalValue}>Total: {formatValue(totalValue)}</span>
      </div>

      <TokenTableView
        styles={tableStyles}
        rows={paginatedRows}
        emptyTitle="No holdings"
        emptyHint="Your token holdings will appear here"
        isInWatchlist={isInWatchlist}
        onToggleWatchlist={handleToggleWatchlist}
        formatPrice={formatPrice}
        formatMarketCap={formatValue}
        firstColumnLabel="Token"
        fourthColumnLabel="Value"
      />

      {allRows.length > 0 && (
        <div className={styles.footerMeta}>
          <span className={styles.rangeInfo}>Showing {startItem}-{endItem} of {allRows.length} holdings</span>
          <div className={styles.paginationWrap}>
            <button
              type="button"
              className={styles.pageButton}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              Prev
            </button>
            <span className={styles.pageInfo}>Page {currentPage} of {totalPages}</span>
            <button
              type="button"
              className={styles.pageButton}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </button>
          </div>
        </div>
      )}

      <div className={styles.sectionHint}>
        Sorted by value descending (top 5 on the first page)
      </div>
    </div>
  );
}