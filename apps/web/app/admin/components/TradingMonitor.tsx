"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./styles/TradingMonitor.module.css";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001").replace(/\/$/, "");

type AdminOrder = {
  order_id: string;
  trader_address: string;
  symbol: string;
  side: "LONG" | "SHORT";
  order_type: "market" | "limit";
  original_size: string;
  remaining_size: string;
  filled_size: string;
  leverage: string;
  limit_price?: string;
  status: string;
  reject_reason?: string;
  created_at: string;
};

type AdminPosition = {
  positionId: string;
  trader: string;
  side: "LONG" | "SHORT";
  marketId: string;
  exposureUsd: string;
  marginUsd: string;
  entryPriceUsd: string;
  liquidationPriceUsd: string;
  active: boolean;
};

type AdminClosedPosition = {
  positionId: string;
  trader: string;
  realizedPnlUsd: string;
  fundingPaymentUsd: string;
  totalReturnUsd: string;
  txHash: string;
  blockNumber: number;
};

type SubTab = "orders" | "positions" | "closed";

function shortAddr(addr?: string) {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function TradingMonitor() {
  const [subTab, setSubTab] = useState<SubTab>("orders");

  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [openPositions, setOpenPositions] = useState<AdminPosition[]>([]);
  const [closedPositionsOnChain, setClosedPositionsOnChain] = useState<AdminPosition[]>([]);
  const [closedPositionHistory, setClosedPositionHistory] = useState<AdminClosedPosition[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ordersRes, positionsRes, closedRes] = await Promise.all([
        fetch(`${API_BASE}/api/smart-contracts/perps/admin/orders`),
        fetch(`${API_BASE}/api/smart-contracts/perps/admin/positions`),
        fetch(`${API_BASE}/api/smart-contracts/perps/admin/closed-positions`),
      ]);

      const ordersData = await ordersRes.json();
      const positionsData = await positionsRes.json();
      const closedData = await closedRes.json();

      if (!ordersData.success) throw new Error(ordersData.error || "Failed to load orders");
      if (!positionsData.success) throw new Error(positionsData.error || "Failed to load positions");
      if (!closedData.success) throw new Error(closedData.error || "Failed to load closed position history");

      setOrders(ordersData.orders ?? []);
      setOpenPositions(positionsData.open ?? []);
      setClosedPositionsOnChain(positionsData.closed ?? []);
      setClosedPositionHistory(closedData.closed ?? []);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trading monitor data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 15000);
    return () => clearInterval(interval);
  }, []);

  const openOrders = useMemo(
    () => orders.filter((o) => o.status === "pending" || o.status === "partial"),
    [orders]
  );
  const otherOrders = useMemo(
    () => orders.filter((o) => o.status !== "pending" && o.status !== "partial"),
    [orders]
  );

  // Merge on-chain PositionClosed realized-PnL events with the raw closed
  // struct list (event data has the PnL; struct list confirms it's fully
  // wound down) keyed by positionId.
  const closedPositionsWithPnl = useMemo(() => {
    const pnlByPositionId = new Map(closedPositionHistory.map((c) => [c.positionId, c]));
    return closedPositionsOnChain.map((p) => ({
      ...p,
      pnl: pnlByPositionId.get(p.positionId),
    }));
  }, [closedPositionsOnChain, closedPositionHistory]);

  return (
    <div className={styles.tradingMonitor}>
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Open Orders</div>
          <div className={styles.statValue}>{openOrders.length}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Open Positions (on-chain)</div>
          <div className={styles.statValue}>{openPositions.length}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Closed Positions</div>
          <div className={styles.statValue}>{closedPositionsWithPnl.length}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Last Updated</div>
          <div className={styles.statValue}>
            {lastUpdated ? lastUpdated.toLocaleTimeString() : "—"}
          </div>
        </div>
      </div>

      {error && (
        <div className={`${styles.statusMessage} ${styles.error}`}>
          ⚠️ {error}
        </div>
      )}

      <div className={styles.subTabs}>
        <button
          className={`${styles.subTabButton} ${subTab === "orders" ? styles.active : ""}`}
          onClick={() => setSubTab("orders")}
        >
          Open Orders ({openOrders.length})
        </button>
        <button
          className={`${styles.subTabButton} ${subTab === "positions" ? styles.active : ""}`}
          onClick={() => setSubTab("positions")}
        >
          Live Positions ({openPositions.length})
        </button>
        <button
          className={`${styles.subTabButton} ${subTab === "closed" ? styles.active : ""}`}
          onClick={() => setSubTab("closed")}
        >
          Closed Positions ({closedPositionsWithPnl.length})
        </button>
        <button className={styles.refreshButton} onClick={fetchAll} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {subTab === "orders" && (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Trader</th>
                <th>Symbol</th>
                <th>Side</th>
                <th>Type</th>
                <th>Size</th>
                <th>Filled</th>
                <th>Limit Price</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {openOrders.length === 0 && (
                <tr>
                  <td colSpan={10} className={styles.noResults}>No open orders on the server right now.</td>
                </tr>
              )}
              {openOrders.map((order) => (
                <tr key={order.order_id}>
                  <td className={styles.mono}>{order.order_id.slice(0, 10)}…</td>
                  <td className={styles.mono}>{shortAddr(order.trader_address)}</td>
                  <td>{order.symbol}</td>
                  <td className={order.side === "LONG" ? styles.long : styles.short}>{order.side}</td>
                  <td>{order.order_type}</td>
                  <td>${Number(order.original_size).toFixed(2)}</td>
                  <td>${Number(order.filled_size).toFixed(2)} / ${Number(order.original_size).toFixed(2)}</td>
                  <td>{order.limit_price ? `$${Number(order.limit_price).toFixed(2)}` : "Market"}</td>
                  <td><span className={styles.badgePending}>{order.status}</span></td>
                  <td>{new Date(order.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {otherOrders.length > 0 && (
            <>
              <h4 className={styles.sectionSubheading}>Recently resolved orders</h4>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Trader</th>
                    <th>Symbol</th>
                    <th>Side</th>
                    <th>Status</th>
                    <th>Reject Reason</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {otherOrders.slice(0, 25).map((order) => (
                    <tr key={order.order_id}>
                      <td className={styles.mono}>{order.order_id.slice(0, 10)}…</td>
                      <td className={styles.mono}>{shortAddr(order.trader_address)}</td>
                      <td>{order.symbol}</td>
                      <td className={order.side === "LONG" ? styles.long : styles.short}>{order.side}</td>
                      <td>
                        <span className={order.status === "filled" ? styles.badgeFilled : order.status === "rejected" ? styles.badgeRejected : styles.badgeCancelled}>
                          {order.status}
                        </span>
                      </td>
                      <td className={styles.rejectReason}>{order.reject_reason || "—"}</td>
                      <td>{new Date(order.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {subTab === "positions" && (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Position ID</th>
                <th>Trader</th>
                <th>Side</th>
                <th>Exposure (USD)</th>
                <th>Margin (USD)</th>
                <th>Entry Price</th>
                <th>Liquidation Price</th>
              </tr>
            </thead>
            <tbody>
              {openPositions.length === 0 && (
                <tr>
                  <td colSpan={7} className={styles.noResults}>No open positions on-chain right now.</td>
                </tr>
              )}
              {openPositions.map((position) => (
                <tr key={position.positionId}>
                  <td className={styles.mono}>#{position.positionId}</td>
                  <td className={styles.mono}>{shortAddr(position.trader)}</td>
                  <td className={position.side === "LONG" ? styles.long : styles.short}>{position.side}</td>
                  <td>${Number(position.exposureUsd).toFixed(2)}</td>
                  <td>${Number(position.marginUsd).toFixed(2)}</td>
                  <td>${Number(position.entryPriceUsd).toFixed(2)}</td>
                  <td>${Number(position.liquidationPriceUsd).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {subTab === "closed" && (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Position ID</th>
                <th>Trader</th>
                <th>Realized PnL</th>
                <th>Funding</th>
                <th>Total Return</th>
                <th>Tx</th>
              </tr>
            </thead>
            <tbody>
              {closedPositionsWithPnl.length === 0 && (
                <tr>
                  <td colSpan={6} className={styles.noResults}>No closed positions found in recent history.</td>
                </tr>
              )}
              {closedPositionsWithPnl.map((position) => {
                const pnlValue = position.pnl ? Number(position.pnl.realizedPnlUsd) : null;
                return (
                  <tr key={position.positionId}>
                    <td className={styles.mono}>#{position.positionId}</td>
                    <td className={styles.mono}>{shortAddr(position.trader)}</td>
                    <td className={pnlValue !== null ? (pnlValue >= 0 ? styles.profit : styles.loss) : ""}>
                      {pnlValue !== null ? `${pnlValue >= 0 ? "+" : ""}$${pnlValue.toFixed(2)}` : "—"}
                    </td>
                    <td>{position.pnl ? `$${Number(position.pnl.fundingPaymentUsd).toFixed(2)}` : "—"}</td>
                    <td>{position.pnl ? `$${Number(position.pnl.totalReturnUsd).toFixed(2)}` : "—"}</td>
                    <td className={styles.mono}>
                      {position.pnl ? (
                        <a
                          href={`https://sepolia.basescan.org/tx/${position.pnl.txHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className={styles.txLink}
                        >
                          {position.pnl.txHash.slice(0, 10)}…
                        </a>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
