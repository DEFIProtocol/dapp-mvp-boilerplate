// app/admin/components/perps/AddPerpModal.tsx
"use client";

import { useState, useEffect } from "react";
import { PerpsToken, PerpsTokenFormData } from "@/types/perps";
import styles from "./AddPerpModal.module.css";

interface AddPerpModalProps {
  token?: PerpsToken | null;
  onClose: () => void;
  onSubmit: (data: PerpsTokenFormData) => Promise<void>;
  loading?: boolean;
}

export default function AddPerpModal({ token, onClose, onSubmit, loading = false }: AddPerpModalProps) {
  const [formData, setFormData] = useState<PerpsTokenFormData>({
    symbol: "",
    name: "",
    uuid: "",
    token_address: "",
    pair_standard: "",
    pair_inverse: "",
    base_precision: 8,
    quote_precision: 2,
    min_leverage: 1,
    max_leverage: 50,
    min_position_size: 10,
    max_position_size: 1000000,
    maintenance_margin: 0.005,
    funding_rate_coefficient: 0.0001,
    is_active: true,
    icon_url: ""
  });

  const [searchUuid, setSearchUuid] = useState("");
  const [uuidResults, setUuidResults] = useState<any[]>([]);
  const [showUuidResults, setShowUuidResults] = useState(false);

  useEffect(() => {
    if (token) {
      setFormData({
        symbol: token.symbol,
        name: token.name,
        uuid: token.uuid || "",
        token_address: token.token_address || "",
        pair_standard: token.pair_standard || "",
        pair_inverse: token.pair_inverse || "",
        base_precision: token.base_precision || 8,
        quote_precision: token.quote_precision || 2,
        min_leverage: token.min_leverage || 1,
        max_leverage: token.max_leverage || 50,
        min_position_size: token.min_position_size || 10,
        max_position_size: token.max_position_size || 1000000,
        maintenance_margin: token.maintenance_margin || 0.005,
        funding_rate_coefficient: token.funding_rate_coefficient || 0.0001,
        is_active: token.is_active !== false,
        icon_url: token.icon_url || ""
      });
    }
  }, [token]);

  // Mock UUID search - replace with actual API call
  const handleUuidSearch = async (value: string) => {
    setSearchUuid(value);
    if (value.length < 2) {
      setUuidResults([]);
      return;
    }

    // This should be replaced with actual API call to your tokens/coinranking data
    const mockResults = [
      { symbol: "BTC", name: "Bitcoin", uuid: "Qwsogvtv82FCd" },
      { symbol: "ETH", name: "Ethereum", uuid: "razxDUgYGNAdQ" },
      { symbol: "SOL", name: "Solana", uuid: "zNZHO_Sjf" },
    ].filter(item => 
      item.symbol.toLowerCase().includes(value.toLowerCase()) ||
      item.name.toLowerCase().includes(value.toLowerCase()) ||
      item.uuid.toLowerCase().includes(value.toLowerCase())
    );

    setUuidResults(mockResults);
    setShowUuidResults(true);
  };

  const selectUuid = (item: typeof uuidResults[0]) => {
    setFormData({
      ...formData,
      symbol: item.symbol,
      name: item.name,
      uuid: item.uuid
    });
    setShowUuidResults(false);
    setSearchUuid("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(formData);
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>{token ? "Edit Perpetual" : "Add New Perpetual"}</h2>
          <button onClick={onClose} className={styles.closeBtn}>×</button>
        </div>

        <form onSubmit={handleSubmit} className={styles.modalForm}>
          {/* UUID Search (only for new tokens) */}
          {!token && (
            <div className={styles.uuidSearch}>
              <input
                type="text"
                placeholder="Search by symbol, name, or UUID..."
                value={searchUuid}
                onChange={(e) => handleUuidSearch(e.target.value)}
                onFocus={() => setShowUuidResults(true)}
              />
              {showUuidResults && uuidResults.length > 0 && (
                <div className={styles.uuidResults}>
                  {uuidResults.map((item) => (
                    <div
                      key={item.uuid}
                      className={styles.uuidResultItem}
                      onClick={() => selectUuid(item)}
                    >
                      <span className={styles.resultSymbol}>{item.symbol}</span>
                      <span className={styles.resultName}>{item.name}</span>
                      <span className={styles.resultUuid}>{item.uuid}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label>Symbol *</label>
              <input
                type="text"
                value={formData.symbol}
                onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                required
                placeholder="BTC"
              />
            </div>

            <div className={styles.formGroup}>
              <label>Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="Bitcoin"
              />
            </div>

            <div className={styles.formGroup}>
              <label>UUID</label>
              <input
                type="text"
                value={formData.uuid}
                onChange={(e) => setFormData({ ...formData, uuid: e.target.value })}
                placeholder="Qwsogvtv82FCd"
              />
            </div>

            {/* Token Address Field */}
            <div className={`${styles.formGroup} ${styles.fullWidth}`}>
              <label>Token Address</label>
              <input
                type="text"
                value={formData.token_address}
                onChange={(e) => setFormData({ ...formData, token_address: e.target.value })}
                placeholder="0x..."
                className={styles.addressInput}
              />
              <small style={{ color: '#64748b', fontSize: '0.7rem', marginTop: '0.25rem' }}>
                Contract address of the token (for on-chain interactions)
              </small>
            </div>

            <div className={styles.formGroup}>
              <label>Pair Standard</label>
              <input
                type="text"
                value={formData.pair_standard}
                onChange={(e) => setFormData({ ...formData, pair_standard: e.target.value })}
                placeholder="BTCUSDT"
              />
            </div>

            <div className={styles.formGroup}>
              <label>Pair Inverse</label>
              <input
                type="text"
                value={formData.pair_inverse}
                onChange={(e) => setFormData({ ...formData, pair_inverse: e.target.value })}
                placeholder="BTCUSD"
              />
            </div>

            <div className={styles.formGroup}>
              <label>Icon URL</label>
              <input
                type="url"
                value={formData.icon_url}
                onChange={(e) => setFormData({ ...formData, icon_url: e.target.value })}
                placeholder="https://..."
              />
            </div>

            <div className={styles.formGroup}>
              <label>Base Precision</label>
              <input
                type="number"
                value={formData.base_precision}
                onChange={(e) => setFormData({ ...formData, base_precision: parseInt(e.target.value) })}
                min="0"
                max="18"
              />
            </div>

            <div className={styles.formGroup}>
              <label>Quote Precision</label>
              <input
                type="number"
                value={formData.quote_precision}
                onChange={(e) => setFormData({ ...formData, quote_precision: parseInt(e.target.value) })}
                min="0"
                max="18"
              />
            </div>
          </div>

          <h3 style={{ margin: "1rem 0 0.5rem", color: "#333", fontSize: "1rem" }}>Leverage Settings</h3>
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label>Min Leverage</label>
              <div className={styles.rangeGroup}>
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={formData.min_leverage}
                  onChange={(e) => setFormData({ ...formData, min_leverage: parseInt(e.target.value) })}
                />
                <span>{formData.min_leverage}x</span>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>Max Leverage</label>
              <div className={styles.rangeGroup}>
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={formData.max_leverage}
                  onChange={(e) => setFormData({ ...formData, max_leverage: parseInt(e.target.value) })}
                />
                <span>{formData.max_leverage}x</span>
              </div>
            </div>
          </div>

          <h3 style={{ margin: "1rem 0 0.5rem", color: "#333", fontSize: "1rem" }}>Position Size ($)</h3>
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label>Min Position</label>
              <input
                type="number"
                value={formData.min_position_size}
                onChange={(e) => setFormData({ ...formData, min_position_size: parseFloat(e.target.value) })}
                min="0"
                step="10"
              />
            </div>

            <div className={styles.formGroup}>
              <label>Max Position</label>
              <input
                type="number"
                value={formData.max_position_size}
                onChange={(e) => setFormData({ ...formData, max_position_size: parseFloat(e.target.value) })}
                min="0"
                step="100"
              />
            </div>
          </div>

          <h3 style={{ margin: "1rem 0 0.5rem", color: "#333", fontSize: "1rem" }}>Margin & Funding</h3>
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label>Maintenance Margin (%)</label>
              <input
                type="number"
                value={(formData.maintenance_margin ?? 0.005) * 100}
                onChange={(e) => setFormData({ ...formData, maintenance_margin: parseFloat(e.target.value) / 100 })}
                min="0.1"
                max="10"
                step="0.1"
              />
            </div>

            <div className={styles.formGroup}>
              <label>Funding Rate Coef (%)</label>
              <input
                type="number"
                value={(formData.funding_rate_coefficient ?? 0.0001) * 100}
                onChange={(e) => setFormData({ ...formData, funding_rate_coefficient: parseFloat(e.target.value) / 100 })}
                min="0.001"
                max="1"
                step="0.001"
              />
            </div>
          </div>

          <div className={`${styles.formGroup} ${styles.checkboxGroup}`}>
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
            />
            <label htmlFor="is_active">Active (available for trading)</label>
          </div>

          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.cancelBtn}>
              Cancel
            </button>
            <button 
              type="submit" 
              className={`${styles.submitBtn} ${loading ? styles.loading : ''}`}
              disabled={loading}
            >
              {token ? "Update Perpetual" : "Add Perpetual"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}