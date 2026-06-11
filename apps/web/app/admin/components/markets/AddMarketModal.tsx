"use client";

import { useState } from "react";
import styles from "../perps/AddPerpModal.module.css";

export type Domain = "perps" | "options" | "spot";

export interface AddMarketFormData {
  symbol: string;
  name: string;
  feedId: string;
  initialPriceUsd: string;
  domains: Domain[];
  minLeverage: number;
  maxLeverage: number;
  maintenanceMarginBps: number;
  makerFeeBps: number;
  takerFeeBps: number;
  iconUrl: string;
  uuid: string;
}

interface AddMarketModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const DOMAIN_LABELS: { id: Domain; label: string; emoji: string }[] = [
  { id: "perps", label: "Perpetuals", emoji: "📈" },
  { id: "spot", label: "Spot", emoji: "💱" },
  { id: "options", label: "Options", emoji: "🎯" },
];

const PYTH_COMMON: { symbol: string; name: string; feedId: string; price: number }[] = [
  { symbol: "BTC", name: "Bitcoin", feedId: "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43", price: 100000 },
  { symbol: "ETH", name: "Ethereum", feedId: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace", price: 3500 },
  { symbol: "SOL", name: "Solana", feedId: "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d", price: 180 },
  { symbol: "BNB", name: "BNB", feedId: "0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f", price: 600 },
  { symbol: "AVAX", name: "Avalanche", feedId: "0x93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7", price: 35 },
  { symbol: "LINK", name: "Chainlink", feedId: "0x8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221", price: 15 },
];

const defaultForm: AddMarketFormData = {
  symbol: "",
  name: "",
  feedId: "",
  initialPriceUsd: "",
  domains: ["perps"],
  minLeverage: 1,
  maxLeverage: 50,
  maintenanceMarginBps: 75,
  makerFeeBps: 5,
  takerFeeBps: 10,
  iconUrl: "",
  uuid: "",
};

export default function AddMarketModal({ onClose, onSuccess }: AddMarketModalProps) {
  const [form, setForm] = useState<AddMarketFormData>(defaultForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const toggleDomain = (d: Domain) => {
    setForm((prev) => ({
      ...prev,
      domains: prev.domains.includes(d)
        ? prev.domains.filter((x) => x !== d)
        : [...prev.domains, d],
    }));
  };

  const fillFromQuickSelect = (preset: typeof PYTH_COMMON[number]) => {
    setForm((prev) => ({
      ...prev,
      symbol: preset.symbol,
      name: preset.name,
      feedId: preset.feedId,
      initialPriceUsd: preset.price.toString(),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.symbol || !form.name || form.domains.length === 0) {
      setError("Symbol, name, and at least one domain are required.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `${(process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '')}/api/admin/markets/register`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbol: form.symbol,
            name: form.name,
            feedId: form.feedId || undefined,
            initialPriceUsd: form.initialPriceUsd ? parseFloat(form.initialPriceUsd) : undefined,
            domains: form.domains,
            minLeverage: form.minLeverage,
            maxLeverage: form.maxLeverage,
            maintenanceMarginBps: form.maintenanceMarginBps,
            makerFeeBps: form.makerFeeBps,
            takerFeeBps: form.takerFeeBps,
            iconUrl: form.iconUrl || undefined,
            uuid: form.uuid || undefined,
          }),
        }
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Registration failed");
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
          <h2>Add Market</h2>
          <button onClick={onClose} className={styles.closeBtn}>×</button>
        </div>

        {/* Quick-select presets */}
        <div style={{ padding: "0.75rem 1.5rem 0", display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          {PYTH_COMMON.map((p) => (
            <button
              key={p.symbol}
              type="button"
              onClick={() => fillFromQuickSelect(p)}
              style={{
                padding: "0.25rem 0.6rem",
                fontSize: "0.75rem",
                borderRadius: 6,
                border: "1px solid #334155",
                background: form.symbol === p.symbol ? "#1e40af" : "#1e293b",
                color: "#e2e8f0",
                cursor: "pointer",
              }}
            >
              {p.symbol}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className={styles.modalForm}>
          {error && (
            <div style={{ color: "#f87171", background: "#1e1e1e", borderRadius: 6, padding: "0.5rem 1rem", marginBottom: "0.5rem", fontSize: "0.85rem" }}>
              ❌ {error}
            </div>
          )}

          {/* Domains */}
          <div style={{ marginBottom: "1rem" }}>
            <label style={{ fontWeight: 600, fontSize: "0.85rem", color: "#94a3b8", display: "block", marginBottom: "0.4rem" }}>
              Add to Domains
            </label>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              {DOMAIN_LABELS.map(({ id, label, emoji }) => (
                <label
                  key={id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    cursor: "pointer",
                    padding: "0.35rem 0.75rem",
                    borderRadius: 8,
                    border: `1px solid ${form.domains.includes(id) ? "#3b82f6" : "#334155"}`,
                    background: form.domains.includes(id) ? "#1e3a5f" : "#1e293b",
                    color: "#e2e8f0",
                    fontSize: "0.85rem",
                    userSelect: "none",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={form.domains.includes(id)}
                    onChange={() => toggleDomain(id)}
                    style={{ accentColor: "#3b82f6" }}
                  />
                  {emoji} {label}
                </label>
              ))}
            </div>
          </div>

          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label>Symbol *</label>
              <input
                type="text"
                value={form.symbol}
                onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })}
                required
                placeholder="BTC"
              />
            </div>

            <div className={styles.formGroup}>
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
              <label>Pyth Feed ID <span style={{ color: "#64748b", fontSize: "0.75rem" }}>(auto-filled from quick select, or leave blank for default)</span></label>
              <input
                type="text"
                value={form.feedId}
                onChange={(e) => setForm({ ...form, feedId: e.target.value })}
                placeholder="0x... (leave blank to auto-generate from symbol)"
                className={styles.addressInput}
              />
            </div>

            <div className={styles.formGroup}>
              <label>Initial Price (USD) <span style={{ color: "#64748b", fontSize: "0.75rem" }}>testnet oracle</span></label>
              <input
                type="number"
                value={form.initialPriceUsd}
                onChange={(e) => setForm({ ...form, initialPriceUsd: e.target.value })}
                placeholder="3500"
                min="0"
                step="any"
              />
            </div>

            <div className={styles.formGroup}>
              <label>Icon URL</label>
              <input
                type="url"
                value={form.iconUrl}
                onChange={(e) => setForm({ ...form, iconUrl: e.target.value })}
                placeholder="https://..."
              />
            </div>
          </div>

          {form.domains.includes("perps") && (
            <>
              <h3 style={{ margin: "0.75rem 0 0.4rem", color: "#94a3b8", fontSize: "0.85rem", fontWeight: 600 }}>Perp Parameters</h3>
              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label>Min Leverage</label>
                  <input type="number" value={form.minLeverage} min={1} max={100}
                    onChange={(e) => setForm({ ...form, minLeverage: parseInt(e.target.value) })} />
                </div>
                <div className={styles.formGroup}>
                  <label>Max Leverage</label>
                  <input type="number" value={form.maxLeverage} min={1} max={100}
                    onChange={(e) => setForm({ ...form, maxLeverage: parseInt(e.target.value) })} />
                </div>
                <div className={styles.formGroup}>
                  <label>Maintenance Margin (bps)</label>
                  <input type="number" value={form.maintenanceMarginBps} min={1}
                    onChange={(e) => setForm({ ...form, maintenanceMarginBps: parseInt(e.target.value) })} />
                  <small style={{ color: "#64748b" }}>75 = 0.75%</small>
                </div>
                <div className={styles.formGroup}>
                  <label>Maker Fee (bps)</label>
                  <input type="number" value={form.makerFeeBps} min={0}
                    onChange={(e) => setForm({ ...form, makerFeeBps: parseInt(e.target.value) })} />
                </div>
                <div className={styles.formGroup}>
                  <label>Taker Fee (bps)</label>
                  <input type="number" value={form.takerFeeBps} min={0}
                    onChange={(e) => setForm({ ...form, takerFeeBps: parseInt(e.target.value) })} />
                </div>
              </div>
            </>
          )}

          <div className={styles.modalFooter} style={{ marginTop: "1rem", display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} className={styles.cancelBtn}>
              Cancel
            </button>
            <button type="submit" disabled={loading} className={styles.submitBtn}>
              {loading ? "Registering…" : `Add Market`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
