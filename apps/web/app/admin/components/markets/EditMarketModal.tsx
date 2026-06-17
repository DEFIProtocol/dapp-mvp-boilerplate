"use client";

import { useState, useEffect } from "react";
import styles from "../perps/AddPerpModal.module.css";
import type { PerpsToken } from "@/types/perps";

interface EditMarketModalProps {
  token: PerpsToken;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditMarketModal({ token, onClose, onSuccess }: EditMarketModalProps) {
  const [form, setForm] = useState({
    name: token.name,
    uuid: token.uuid || "",
    tokenAddress: token.token_address || "",
    minLeverage: token.min_leverage || 1,
    maxLeverage: token.max_leverage || 50,
    minPositionSize: token.min_position_size || 10,
    maxPositionSize: token.max_position_size || 1000000,
    maintenanceMargin: token.maintenance_margin ? token.maintenance_margin * 10000 : 75, // Convert to bps
    fundingRateCoefficient: token.funding_rate_coefficient || 0.0001,
    iconUrl: token.icon_url || "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(
        `${(process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '')}/api/perps/db/${token.symbol}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name,
            uuid: form.uuid || null,
            min_leverage: form.minLeverage,
            max_leverage: form.maxLeverage,
            min_position_size: form.minPositionSize,
            max_position_size: form.maxPositionSize,
            maintenance_margin: form.maintenanceMargin / 10000, // Convert bps to decimal
            funding_rate_coefficient: form.fundingRateCoefficient,
            icon_url: form.iconUrl || null,
          }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Update failed");
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Edit Market: {token.symbol}</h2>
          <button onClick={onClose} className={styles.closeBtn}>×</button>
        </div>

        <form onSubmit={handleSubmit} className={styles.modalForm}>
          {error && (
            <div style={{ color: "#f87171", background: "#1e1e1e", borderRadius: 6, padding: "0.5rem 1rem", marginBottom: "0.5rem", fontSize: "0.85rem" }}>
              ❌ {error}
            </div>
          )}

          <div className={styles.formGrid}>
            <div className={`${styles.formGroup} ${styles.fullWidth}`}>
              <label>Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                placeholder="Bitcoin"
              />
            </div>

            <div className={`${styles.formGroup} ${styles.fullWidth}`}>
              <label>UUID</label>
              <input
                type="text"
                value={form.uuid}
                onChange={(e) => setForm({ ...form, uuid: e.target.value })}
                placeholder="Optional UUID"
              />
            </div>

            <div className={`${styles.formGroup} ${styles.fullWidth}`}>
              <label>Contract Address <span style={{ color: "#64748b", fontSize: "0.75rem" }}>(read-only)</span></label>
              <input
                type="text"
                value={form.tokenAddress || "Not set"}
                disabled
                style={{ opacity: 0.6, cursor: "not-allowed" }}
              />
            </div>

            <div className={styles.formGroup}>
              <label>Min Leverage</label>
              <input
                type="number"
                value={form.minLeverage}
                min={1}
                max={100}
                onChange={(e) => setForm({ ...form, minLeverage: parseInt(e.target.value) })}
              />
            </div>

            <div className={styles.formGroup}>
              <label>Max Leverage</label>
              <input
                type="number"
                value={form.maxLeverage}
                min={1}
                max={100}
                onChange={(e) => setForm({ ...form, maxLeverage: parseInt(e.target.value) })}
              />
            </div>

            <div className={styles.formGroup}>
              <label>Min Position Size (USD)</label>
              <input
                type="number"
                value={form.minPositionSize}
                min={0}
                onChange={(e) => setForm({ ...form, minPositionSize: parseFloat(e.target.value) })}
              />
            </div>

            <div className={styles.formGroup}>
              <label>Max Position Size (USD)</label>
              <input
                type="number"
                value={form.maxPositionSize}
                min={0}
                onChange={(e) => setForm({ ...form, maxPositionSize: parseFloat(e.target.value) })}
              />
            </div>

            <div className={styles.formGroup}>
              <label>Maintenance Margin (bps)</label>
              <input
                type="number"
                value={form.maintenanceMargin}
                min={1}
                onChange={(e) => setForm({ ...form, maintenanceMargin: parseFloat(e.target.value) })}
              />
              <small style={{ color: "#64748b" }}>75 = 0.75%</small>
            </div>

            <div className={styles.formGroup}>
              <label>Funding Rate Coefficient</label>
              <input
                type="number"
                value={form.fundingRateCoefficient}
                min={0}
                step="0.0001"
                onChange={(e) => setForm({ ...form, fundingRateCoefficient: parseFloat(e.target.value) })}
              />
            </div>

            <div className={`${styles.formGroup} ${styles.fullWidth}`}>
              <label>Icon URL</label>
              <input
                type="url"
                value={form.iconUrl}
                onChange={(e) => setForm({ ...form, iconUrl: e.target.value })}
                placeholder="https://..."
              />
            </div>
          </div>

          <div className={styles.modalFooter} style={{ marginTop: "1rem", display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} className={styles.cancelBtn}>
              Cancel
            </button>
            <button type="submit" disabled={loading} className={styles.submitBtn}>
              {loading ? "Updating…" : "Update Market"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
