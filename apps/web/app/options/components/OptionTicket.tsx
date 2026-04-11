"use client";

import { useMemo, useState } from "react";
import { Zap } from "lucide-react";
import { getOrderCostEstimate } from "@/lib/api/optionsTrading";
import type { OptionSeries, OptionSide } from "@/types/optionsTrading";
import styles from "./styles/OptionsDashboard.module.css";

interface OptionTicketProps {
  series?: OptionSeries;
  spotPrice: number;
  submitting: boolean;
  message?: string | null;
  error?: string | null;
  onSubmit: (side: OptionSide, quantity: number) => Promise<void>;
}

export default function OptionTicket({
  series,
  spotPrice,
  submitting,
  message,
  error,
  onSubmit,
}: OptionTicketProps) {
  const [side, setSide] = useState<OptionSide>("buy");
  const [quantity, setQuantity] = useState(1);

  const totalPremium = useMemo(() => {
    if (!series) return 0;
    return getOrderCostEstimate(series, side, quantity);
  }, [series, side, quantity]);

  const maxLoss = useMemo(() => {
    if (!series) return "—";
    if (side === "buy") return `$${totalPremium.toFixed(2)}`;
    return series.optionType === "call" ? "Large / unlimited" : `$${Math.max(series.strike * quantity - totalPremium, 0).toFixed(2)}`;
  }, [series, side, quantity, totalPremium]);

  const maxGain = useMemo(() => {
    if (!series) return "—";
    if (side === "buy") {
      return series.optionType === "call"
        ? "Unlimited"
        : `$${Math.max(series.strike * quantity - totalPremium, 0).toFixed(2)}`;
    }
    return `$${totalPremium.toFixed(2)}`;
  }, [series, side, quantity, totalPremium]);

  const contractLabel = series ? `${series.underlying} ${series.expiryLabel} ${series.strike} ${series.optionType.toUpperCase()}` : "Select a series";

  return (
    <div className={styles.ticketCard}>
      <div className={styles.ticketHeader}>
        <div>
          <p className={styles.eyebrow}>Order ticket</p>
          <h3 className={styles.ticketTitle}>{contractLabel}</h3>
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
        <label className={styles.inputLabel}>Contracts</label>
        <input
          type="number"
          min="1"
          step="1"
          value={quantity}
          onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
          className={styles.input}
        />
      </div>

      <div className={styles.quoteBox}>
        <div className={styles.quoteRow}><span>Spot</span><strong>${spotPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong></div>
        <div className={styles.quoteRow}><span>Mark</span><strong>{series ? `$${series.mark.toFixed(2)}` : "—"}</strong></div>
        <div className={styles.quoteRow}><span>Bid / Ask</span><strong>{series ? `$${series.bid.toFixed(2)} / $${series.ask.toFixed(2)}` : "—"}</strong></div>
        <div className={styles.quoteRow}><span>IV</span><strong>{series ? `${(series.iv * 100).toFixed(1)}%` : "—"}</strong></div>
      </div>

      <div className={styles.summaryGrid}>
        <div className={styles.summaryItem}>
          <span>Total premium</span>
          <strong>{series ? `$${totalPremium.toFixed(2)}` : "—"}</strong>
        </div>
        <div className={styles.summaryItem}>
          <span>Breakeven</span>
          <strong>{series ? `$${series.breakeven.toFixed(2)}` : "—"}</strong>
        </div>
        <div className={styles.summaryItem}>
          <span>Max loss</span>
          <strong>{maxLoss}</strong>
        </div>
        <div className={styles.summaryItem}>
          <span>Max gain</span>
          <strong>{maxGain}</strong>
        </div>
      </div>

      <div className={styles.greeksGrid}>
        <span>Δ {series ? series.delta.toFixed(2) : "—"}</span>
        <span>Γ {series ? series.gamma.toFixed(3) : "—"}</span>
        <span>Θ {series ? series.theta.toFixed(2) : "—"}</span>
        <span>V {series ? series.vega.toFixed(2) : "—"}</span>
      </div>

      {message ? <div className={styles.successMessage}>{message}</div> : null}
      {error ? <div className={styles.errorMessage}>{error}</div> : null}

      <button
        type="button"
        className={styles.primaryButton}
        onClick={() => onSubmit(side, quantity)}
        disabled={!series || submitting}
      >
        <Zap size={14} />
        {submitting ? "Submitting..." : side === "buy" ? "Place demo buy" : "Place demo sell"}
      </button>

      <p className={styles.ticketHint}>
        Frontend-only demo order flow for Base. Contract wiring can be added later without changing the layout.
      </p>
    </div>
  );
}
