import { Globe, Plus, Shield, X } from "lucide-react";
import type { PreferencesSectionProps } from "./types";
import styles from "../SettingsPage.module.css";

interface ChainItem {
  id: number;
  label: string;
  slug: string;
}

interface ChainsSectionProps extends PreferencesSectionProps {
  availableChains: ChainItem[];
  connectedChains: Record<string, string>;
  onConnectChain: (chain: ChainItem) => void;
  onDisconnectChain: (chain: ChainItem) => void;
}

export function ChainsSection({
  preferences,
  setPreferences,
  availableChains,
  connectedChains,
  onConnectChain,
  onDisconnectChain,
}: ChainsSectionProps) {
  return (
    <div className={styles.sectionStack}>
      <div className={styles.settingsCard}>
        <div className={styles.cardHeader}>
          <div className={styles.cardHeaderLeft}>
            <div className={styles.cardIcon}>
              <Globe size={18} />
            </div>
            <div>
              <h2 className={styles.cardTitle}>Connected Chains</h2>
              <p className={styles.cardDescription}>Manage your blockchain wallet connections</p>
            </div>
          </div>
        </div>

        <div className={styles.chainsGrid}>
          {availableChains.map((chain) => {
            const chainKey = String(chain.id);
            const chainAddress = connectedChains[chainKey] || connectedChains[chain.label];
            const isConnected = Boolean(chainAddress);

            return (
              <div key={chain.id} className={`${styles.chainCard} ${isConnected ? styles.connected : ""}`}>
                <div className={styles.chainCardHeader}>
                  <div className={`${styles.chainStatus} ${isConnected ? styles.connected : styles.disconnected}`} />
                  <span className={styles.chainName}>{chain.label}</span>
                </div>

                {isConnected && chainAddress ? (
                  <div className={styles.chainAddress}>
                    <span className={styles.addressLabel}>Connected as</span>
                    <span className={styles.addressValue}>
                      {chainAddress.slice(0, 6)}...{chainAddress.slice(-4)}
                    </span>
                  </div>
                ) : null}

                <div className={styles.chainCardFooter}>
                  {isConnected ? (
                    <button
                      type="button"
                      onClick={() => onDisconnectChain(chain)}
                      className={`${styles.chainButton} ${styles.disconnectButton}`}
                    >
                      <X size={14} />
                      <span>Disconnect</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onConnectChain(chain)}
                      className={`${styles.chainButton} ${styles.connectButton}`}
                    >
                      <Plus size={14} />
                      <span>Connect</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.settingsCard}>
        <div className={styles.cardHeader}>
          <div className={styles.cardHeaderLeft}>
            <div className={styles.cardIcon}>
              <Shield size={18} />
            </div>
            <div>
              <h2 className={styles.cardTitle}>Active Chains</h2>
              <p className={styles.cardDescription}>Choose which chains are enabled in your UI</p>
            </div>
          </div>
        </div>

        <div className={styles.chainsSelectGrid}>
          {availableChains.map((chain) => (
            <label key={chain.id} className={styles.chainSelectItem}>
              <input
                type="checkbox"
                checked={preferences.enabledChains?.includes(chain.id)}
                onChange={(event) => {
                  const updated = event.target.checked
                    ? [...(preferences.enabledChains || []), chain.id]
                    : (preferences.enabledChains || []).filter((id) => id !== chain.id);

                  setPreferences((prev) => ({
                    ...prev,
                    enabledChains: updated,
                  }));
                }}
                className={styles.chainCheckbox}
              />
              <span className={styles.chainSelectLabel}>{chain.label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
