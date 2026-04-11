"use client";

import { useEffect, useMemo, useState } from "react";
import { Zap } from "lucide-react";
import { getSpotOrderEstimate } from "../../src/lib/api/spotTrading";
import type { SpotMarket, SpotOrderSide } from "../../src/types/spotTrading";
import styles from "../../options/components/styles/OptionsDashboard.module.css";

interface SpotTicketProps {
  market?: SpotMarket;
  spotPrice: number;
  submitting: boolean;
  message?: string | null;
  error?: string | null;
  onSubmit: (side: SpotOrderSide, quantity: number, limitPrice?: number) => Promise<void>;
}

export default function SpotTicket({
  market,
  spotPrice,
  submitting,
  message,
  error,
  onSubmit,
}: SpotTicketProps) {
  const [side, setSide] = useState<SpotOrderSide>("buy");
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [quantity, setQuantity] = useState(1);
  const [limitPrice, setLimitPrice] = useState(0);

  useEffect(() => {
    setLimitPrice(Number(spotPrice.toFixed(2)));
  }, [spotPrice]);

  const estimate = useMemo(() => {
    return getSpotOrderEstimate({
      side,
      quantity,
      referencePrice: spotPrice,
      limitPrice: orderType === "limit" ? limitPrice : undefined,
    });
  }, [side, quantity, spotPrice, orderType, limitPrice]);

  const marketLabel = market ? `${market.symbol} / USDC` : "Select a market";

  return (
    <div className={styles.ticketCard}>
      <div className={styles.ticketHeader}>
        <div>
          <p className={styles.eyebrow}>Spot order ticket</p>
          <h3 className={styles.ticketTitle}>{marketLabel}</h3>
        </div>
        <span className={styles.baseOnlyBadge}>Base</span>
      </div>

      <div className={styles.sideToggle}>
        <button
          type="button"
          className={`${styles.sideButton} ${side === "buy" ? styles.sideButtonActive : ""}`}
          onClick={() => setSide("buy")}
        >
          Buy
        </button>
        <button
          type="button"
          className={`${styles.sideButton} ${side === "sell" ? styles.sideButtonSell : ""}`}
          onClick={() => setSide("sell")}
        >
          Sell
        </button>
      </div>

      <div className={styles.inputGroup}>
        <label className={styles.inputLabel}>Order type</label>
        <select
          value={orderType}
          onChange={(event) => setOrderType(event.target.value as "market" | "limit")}
          className={styles.select}
        >
          <option value="market">Market</option>
          <option value="limit">Limit</option>
        </select>
      </div>

      <div className={styles.inputGroup}>
        <label className={styles.inputLabel}>Quantity</label>
        <input
          type="number"
          min="0.001"
          step="0.001"
          value={quantity}
          onChange={(event) => setQuantity(Math.max(0.001, Number(event.target.value) || 0.001))}
          className={styles.input}
        />
      </div>

      {orderType === "limit" && (
        <div className={styles.inputGroup}>
          <label className={styles.inputLabel}>Limit price</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={limitPrice}
            onChange={(event) => setLimitPrice(Math.max(0, Number(event.target.value) || 0))}
            className={styles.input}
          />
        </div>
      )}

      <div className={styles.quoteBox}>
        <div className={styles.quoteRow}><span>Spot</span><strong>${spotPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></div>
        <div className={styles.quoteRow}><span>Execution</span><strong>${estimate.executionPrice.toFixed(2)}</strong></div>
        <div className={styles.quoteRow}><span>Notional</span><strong>${estimate.notional.toFixed(2)}</strong></div>
        <div className={styles.quoteRow}><span>Fees</span><strong>${estimate.fees.toFixed(2)}</strong></div>
      </div>

      <div className={styles.summaryGrid}>
        <div className={styles.summaryItem}>
          <span>Pair</span>
          <strong>{market?.symbol ?? "—"}/USDC</strong>
        </div>
        <div className={styles.summaryItem}>
          <span>Size</span>
          <strong>{quantity.toFixed(3)} {market?.symbol ?? "units"}</strong>
        </div>
        <div className={styles.summaryItem}>
          <span>Est. slippage</span>
          <strong>{orderType === "market" ? "0.10%" : "Maker"}</strong>
        </div>
        <div className={styles.summaryItem}>
          <span>Total</span>
          <strong>${estimate.total.toFixed(2)}</strong>
        </div>
      </div>

      {message ? <div className={styles.successMessage}>{message}</div> : null}
      {error ? <div className={styles.errorMessage}>{error}</div> : null}

      <button
        type="button"
        className={styles.primaryButton}
        onClick={() => onSubmit(side, quantity, orderType === "limit" ? limitPrice : undefined)}
        disabled={!market || submitting}
      >
        <Zap size={14} />
        {submitting ? "Submitting..." : side === "buy" ? "Place demo buy" : "Place demo sell"}
      </button>

      <p className={styles.ticketHint}>
        Frontend-only spot execution preview for Base. Wallet and contract settlement can be wired in later.
      </p>
    </div>
  );
}
