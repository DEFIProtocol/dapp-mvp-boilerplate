// app/account/components/Watchlist.tsx
"use client";

import { useMemo } from "react";
import { usePriceStore } from "@/contexts/PriceStoreContext";
import { usePerps } from "@/contexts/PerpsContext";
import { useUserContext } from "@/contexts/UserContext";
import { useChainContext } from "@/contexts/ChainContext";
import TokenTableView, { TokenTableRow } from "@/components/tables/TokenTableView";
import tableStyles from "../../tokens/TokensPage.module.css";
import styles from "./styles/Watchlist.module.css";

interface WatchlistProps {
  watchlist: string[];
  tokens: any[];
  selectedChain: number;
}

export function Watchlist({ watchlist, tokens, selectedChain }: WatchlistProps) {
  const { priceMap } = usePriceStore();
  const { activeTokens } = usePerps();
  const { toggleWatchlistToken, isInWatchlist } = useUserContext();
  const { getChainSlug, getChainLabel } = useChainContext();

  const watchlistSymbols = useMemo(() => {
    return (Array.isArray(watchlist) ? watchlist : [])
      .map((item: any) => (typeof item === "string" ? item : item?.symbol))
      .map((symbol) => String(symbol || "").trim().toUpperCase())
      .filter(Boolean);
  }, [watchlist]);

  const watchlistSet = useMemo(() => new Set(watchlistSymbols), [watchlistSymbols]);

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

  const chainKeyMap: Record<string, string[]> = {
    "8453": ["base"],
    "1": ["ethereum"],
    "56": ["bnb", "bsc"],
    "137": ["polygon"],
    "43114": ["avalanche"],
    "42161": ["arbitrum"],
    "501": ["solana"],
  };

  const marketRows = useMemo<TokenTableRow[]>(() => {
    const chainKey = String(selectedChain || "");
    const aliasKeys = chainKeyMap[chainKey] || [];

    return (tokens || [])
      .filter((token) => {
        const symbol = String(token?.symbol || "").toUpperCase();
        if (!symbol || !watchlistSet.has(symbol)) return false;

        const chains = normalizeChains(token?.chains);
        return Boolean(chains[chainKey] || aliasKeys.some((key) => Boolean(chains[key])));
      })
      .map((token) => {
        const symbol = String(token?.symbol || "").toUpperCase();
        const priceEntry = priceMap[symbol] as any;
        const rawPrice = typeof token?.price === "number" ? token.price : Number(token?.price);
        const rawCap = (token as any)?.market_cap ?? (token as any)?.marketCap;
        const rawChange = (token as any)?.change;

        return {
          key: `market-${symbol}-${token?.uuid || ""}`,
          symbol,
          name: token?.name || symbol,
          image: token?.image,
          href: token?.uuid ? `/market/${getChainSlug(selectedChain)}/${token.uuid}` : undefined,
          price: typeof priceEntry?.price === "number" ? priceEntry.price : (Number.isFinite(rawPrice) ? rawPrice : null),
          marketCap: typeof priceEntry?.marketCap === "number" ? priceEntry.marketCap : (Number.isFinite(Number(rawCap)) ? Number(rawCap) : null),
          change24h: typeof priceEntry?.change24h === "number" ? priceEntry.change24h : (Number.isFinite(Number(rawChange)) ? Number(rawChange) : null),
        };
      });
  }, [tokens, selectedChain, watchlistSet, priceMap, getChainSlug]);

  const futuresRows = useMemo<TokenTableRow[]>(() => {
    return (activeTokens || [])
      .filter((token) => watchlistSet.has(String(token?.symbol || "").toUpperCase()))
      .map((token) => {
        const symbol = String(token?.symbol || "").toUpperCase();
        const priceEntry = priceMap[symbol] as any;

        return {
          key: `futures-${symbol}`,
          symbol,
          name: `${token?.name || symbol} Perp`,
          image: token?.icon_url,
          href: "/futures",
          price: typeof priceEntry?.price === "number" ? priceEntry.price : null,
          marketCap: typeof priceEntry?.marketCap === "number" ? priceEntry.marketCap : null,
          change24h: typeof priceEntry?.change24h === "number" ? priceEntry.change24h : null,
        };
      });
  }, [activeTokens, watchlistSet, priceMap]);

  const formatPrice = (value: number | null) => {
    if (value === null || Number.isNaN(value)) return "—";
    if (value < 0.01) return `$${value.toLocaleString(undefined, { maximumFractionDigits: 6 })}`;
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  };

  const formatMarketCap = (value: number | null) => {
    if (value === null || Number.isNaN(value)) return "—";
    if (value >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
    if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  };

  const handleToggle = async (symbol: string, event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    await toggleWatchlistToken(symbol);
  };

  return (
    <>
      <div className={tableStyles.tableCard}>
        <div className={styles.sectionHeader}>
          <h2>Futures Watchlist</h2>
          <span className={styles.sectionCount}>{futuresRows.length}</span>
        </div>

        <TokenTableView
          styles={tableStyles}
          rows={futuresRows}
          emptyTitle="No futures favorites"
          emptyHint="Add futures markets to track them here"
          isInWatchlist={isInWatchlist}
          onToggleWatchlist={handleToggle}
          formatPrice={formatPrice}
          formatMarketCap={formatMarketCap}
          firstColumnLabel="Futures"
        />
      </div>

      <div className={tableStyles.tableCard}>
        <div className={styles.sectionHeader}>
          <h2>Markets Watchlist</h2>
          <span className={styles.sectionCount}>{marketRows.length}</span>
        </div>

        <TokenTableView
          styles={tableStyles}
          rows={marketRows}
          emptyTitle="No market favorites"
          emptyHint={
            <>
              <span>Tokens will be saved to current chain.</span>
              <br />
              <span>Current chain is {getChainLabel(selectedChain)}.</span>
            </>
          }
          isInWatchlist={isInWatchlist}
          onToggleWatchlist={handleToggle}
          formatPrice={formatPrice}
          formatMarketCap={formatMarketCap}
          firstColumnLabel="Token"
        />
      </div>
    </>
  );
}