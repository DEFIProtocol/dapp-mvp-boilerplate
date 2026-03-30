import { TrendingUp } from "lucide-react";
import type { PreferencesSectionProps } from "./types";
import styles from "../SettingsPage.module.css";

export function TradingPreferencesSection({ preferences, setPreferences }: PreferencesSectionProps) {
  return (
    <div className={styles.settingsCard}>
      <div className={styles.cardHeader}>
        <div className={styles.cardHeaderLeft}>
          <div className={styles.cardIcon}>
            <TrendingUp size={18} />
          </div>
          <div>
            <h2 className={styles.cardTitle}>Trading Preferences</h2>
            <p className={styles.cardDescription}>Fine-tune your trading experience</p>
          </div>
        </div>
      </div>

      <div className={styles.slippageControl}>
        <div className={styles.slippageHeader}>
          <span className={styles.slippageLabel}>Slippage Tolerance</span>
          <span className={styles.slippageValue}>{preferences.trading.slippageTolerance}%</span>
        </div>
        <input
          type="range"
          min="0.1"
          max="5"
          step="0.1"
          value={preferences.trading.slippageTolerance}
          onChange={(event) =>
            setPreferences((prev) => ({
              ...prev,
              trading: {
                ...prev.trading,
                slippageTolerance: parseFloat(event.target.value),
              },
            }))
          }
          className={styles.slippageSlider}
        />
        <div className={styles.slippageMarkers}>
          <span>0.1%</span>
          <span>2.5%</span>
          <span>5%</span>
        </div>
      </div>

      <div className={styles.selectWrapper}>
        <label className={styles.selectLabel}>Default Order Type</label>
        <select
          value={preferences.trading.defaultOrderType}
          onChange={(event) =>
            setPreferences((prev) => ({
              ...prev,
              trading: {
                ...prev.trading,
                defaultOrderType: event.target.value,
              },
            }))
          }
          className={styles.selectInput}
        >
          <option value="market">Market</option>
          <option value="limit">Limit</option>
          <option value="stop">Stop Loss</option>
        </select>
      </div>

      <label className={styles.toggleItem}>
        <span className={styles.toggleLabel}>Show confirmation dialogs</span>
        <div className={styles.toggleSwitch}>
          <input
            type="checkbox"
            checked={preferences.trading.showConfirmationDialogs}
            onChange={(event) =>
              setPreferences((prev) => ({
                ...prev,
                trading: {
                  ...prev.trading,
                  showConfirmationDialogs: event.target.checked,
                },
              }))
            }
            className={styles.toggleInput}
          />
          <span className={styles.toggleSlider} />
        </div>
      </label>

      <label className={styles.toggleItem}>
        <span className={styles.toggleLabel}>Share trading activity</span>
        <div className={styles.toggleSwitch}>
          <input
            type="checkbox"
            checked={preferences.privacy.shareTradingActivity}
            onChange={(event) =>
              setPreferences((prev) => ({
                ...prev,
                privacy: {
                  ...prev.privacy,
                  shareTradingActivity: event.target.checked,
                },
              }))
            }
            className={styles.toggleInput}
          />
          <span className={styles.toggleSlider} />
        </div>
      </label>
    </div>
  );
}
