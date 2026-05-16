"use client";

import { useMemo } from "react";
import { usePerpsOrderBookPolling } from "@dapp/trading-hooks";
import type { OrderBookLevel } from "@/types/perpsTrading";
import styles from "./styles/PerpOrderBook.module.css";

type Props = {
  symbol: string;
  referencePrice: number;
  depth?: number;
};

function formatPrice(price: number): string {
  return `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatSize(size: number): string {
  return size.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function computeSpread(bid?: number, ask?: number): number {
  if (!bid || !ask) return 0;
  return Math.max(ask - bid, 0);
}

export default function PerpOrderBook({ symbol, referencePrice, depth = 8 }: Props) {
  const { data: snapshot, loading, error } = usePerpsOrderBookPolling(symbol, depth, { intervalMs: 2500 });

  const bids: OrderBookLevel[] = snapshot?.bids ?? [];
  const asks: OrderBookLevel[] = snapshot?.asks ?? [];

  const bestBid = bids[0]?.price ?? snapshot?.fallbackQuote?.bestBid ?? referencePrice;
  const bestAsk = asks[0]?.price ?? snapshot?.fallbackQuote?.bestAsk ?? referencePrice;
  const spread = useMemo(() => computeSpread(bestBid, bestAsk), [bestBid, bestAsk]);
  const rows = Math.max(bids.length, asks.length, depth);

  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Liquidity</p>
          <h3 className={styles.title}>{symbol} Perp Orderbook</h3>
        </div>
        <span className={styles.badge}>{snapshot?.fallbackQuote ? "Fallback quote" : "Native book"}</span>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}

      <div className={styles.meta}>
        <span>Best bid {formatPrice(bestBid)}</span>
        <span>Best ask {formatPrice(bestAsk)}</span>
        <span>Spread {formatPrice(spread)}</span>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Bid size</th>
              <th>Bid</th>
              <th>Ask</th>
              <th>Ask size</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, index) => {
              const bid = bids[index];
              const ask = asks[index];
              return (
                <tr key={`${bid?.price ?? "b"}-${ask?.price ?? "a"}-${index}`}>
                  <td>{bid ? formatSize(bid.size) : "-"}</td>
                  <td className={styles.bid}>{bid ? formatPrice(bid.price) : "-"}</td>
                  <td className={styles.ask}>{ask ? formatPrice(ask.price) : "-"}</td>
                  <td>{ask ? formatSize(ask.size) : "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {loading ? <p className={styles.hint}>Loading orderbook...</p> : null}
      {!loading && bids.length === 0 && asks.length === 0 ? (
        <p className={styles.hint}>No native resting orders yet. Showing fallback quote until depth appears.</p>
      ) : null}
    </section>
  );
}
