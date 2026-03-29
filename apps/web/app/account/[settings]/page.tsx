// app/account/settings/page.tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { useUser } from "@/contexts/UserContext";
import { useChainContext } from "@/contexts/ChainContext";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { patchUserPreferencesByWallet, updateUserByWallet, UserPreferences } from "@/lib/api/users";
import { CHART_SURFACE_LABELS, DEFAULT_CHART_PREFERENCES } from "@/lib/chartPreferences";
import { CHART_INDICATORS } from "@/components/charts/indicators";
import { Settings, Mail, Globe, Palette, TrendingUp, Shield, Check, Plus, X } from "lucide-react";
import styles from "./SettingsPage.module.css";

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "dark",
  defaultView: "trading",
  notifications: {
    email: {
      tradeExecuted: true,
      orderFilled: true,
      priceAlerts: true,
      securityAlerts: true,
      newsletter: false
    }
  },
  trading: {
    slippageTolerance: 0.5,
    defaultOrderType: "market",
    showConfirmationDialogs: true,
    favoritePairs: []
  },
  privacy: {
    showBalanceInNav: true,
    shareTradingActivity: false
  },
  enabledChains: [1, 8453],
  chart: DEFAULT_CHART_PREFERENCES
};

export default function SettingsPage() {
  const { user, loading, refreshUser } = useUser();
  const { availableChains, setSelectedChain } = useChainContext();
  const { address } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [email, setEmail] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [connectedChains, setConnectedChains] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const chartSummary = useMemo(() => {
    const chartPrefs = preferences.chart || DEFAULT_CHART_PREFERENCES;
    return Object.entries(chartPrefs).map(([surfaceKey, value]) => ({
      surfaceKey,
      label: CHART_SURFACE_LABELS[surfaceKey as keyof typeof CHART_SURFACE_LABELS],
      timeframe: value.timeframe,
      chartType: value.chartType,
      indicators: value.indicators,
      activeTool: value.activeTool
    }));
  }, [preferences.chart]);
  const indicatorList = useMemo(() => {
    const chartPrefs = preferences.chart || DEFAULT_CHART_PREFERENCES;
    const enabledIndicators = new Set<string>();

    Object.values(chartPrefs).forEach((surfaceValue) => {
      surfaceValue.indicators.forEach((indicatorId) => enabledIndicators.add(indicatorId));
    });

    return CHART_INDICATORS.map((indicator) => ({
      id: indicator.id,
      label: indicator.label,
      description: indicator.description,
      enabled: enabledIndicators.has(indicator.id),
      implemented: indicator.implemented
    }));
  }, [preferences.chart]);

  useEffect(() => {
    if (user?.preferences) {
      const incoming = user.preferences;
      setPreferences({
        ...DEFAULT_PREFERENCES,
        ...incoming,
        notifications: {
          ...DEFAULT_PREFERENCES.notifications,
          ...(incoming.notifications || {}),
          email: {
            ...DEFAULT_PREFERENCES.notifications.email,
            ...(incoming.notifications?.email || {})
          }
        },
        trading: {
          ...DEFAULT_PREFERENCES.trading,
          ...(incoming.trading || {})
        },
        privacy: {
          ...DEFAULT_PREFERENCES.privacy,
          ...(incoming.privacy || {})
        },
        enabledChains: Array.isArray(incoming.enabledChains)
          ? incoming.enabledChains.map((id) => Number(id)).filter((id) => Number.isFinite(id))
          : DEFAULT_PREFERENCES.enabledChains,
        chart: {
          ...DEFAULT_CHART_PREFERENCES,
          ...(incoming.chart || {})
        }
      });
    } else {
      setPreferences(DEFAULT_PREFERENCES);
    }

    setEmail(user?.email || "");
    setEmailVerified(Boolean(user?.email_verified));

    if (user?.chain_addresses && typeof user.chain_addresses === "object") {
      setConnectedChains(user.chain_addresses as Record<string, string>);
    } else {
      setConnectedChains({});
    }
  }, [user]);

  const handleConnectChain = async (chain: { id: number; label: string; slug: string }) => {
    try {
      const connector = connectors[0];

      if (connector) {
        setSelectedChain(chain.id);
        await connect({ connector });
        setFeedback(`Connecting to ${chain.label}...`);
      }
    } catch (error) {
      setFeedback(`Failed to connect to ${chain.label}`);
    }
  };

  const handleDisconnectChain = async (chain: { id: number; label: string; slug: string }) => {
    try {
      disconnect();

      const updatedChainAddresses = { ...connectedChains };
      delete updatedChainAddresses[String(chain.id)];
      delete updatedChainAddresses[chain.label];

      if (address) {
        const updated = await updateUserByWallet(address, {
          chain_addresses: updatedChainAddresses
        });
        if (!updated) throw new Error("Failed chain update");
        setConnectedChains(updatedChainAddresses);
        await refreshUser();
      }

      setFeedback(`Disconnected from ${chain.label}`);
    } catch (error) {
      setFeedback(`Failed to disconnect from ${chain.label}`);
    }
  };

  const savePreferences = async () => {
    if (!address) {
      setFeedback("No wallet connected");
      return;
    }

    setIsSaving(true);
    try {
      const [preferencesResult, emailResult] = await Promise.all([
        patchUserPreferencesByWallet(address, preferences),
        updateUserByWallet(address, {
          email,
          email_verified: emailVerified
        })
      ]);

      if (!preferencesResult || !emailResult) {
        throw new Error("Save failed");
      }

      await refreshUser();
      setFeedback("Preferences saved successfully");
    } catch (error) {
      setFeedback("Failed to save preferences");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
  };

  const handleVerifyEmail = async () => {
    setEmailVerified(true);
    setFeedback("Verification email sent");
  };

  return (
    <div className={styles.pageContainer}>
      <div className={styles.gradientBg} />

      <main className={styles.main}>
        {/* Header */}
        <div className={styles.headerCard}>
          <div className={styles.headerLeft}>
            <div className={styles.headerIcon}>
              <Settings size={24} />
            </div>
            <div>
              <h1 className={styles.title}>Account Settings</h1>
              <p className={styles.subtitle}>{feedback || "Customize your trading experience"}</p>
            </div>
          </div>
          <button
            onClick={savePreferences}
            disabled={isSaving || loading}
            className={styles.saveButton}
          >
            {isSaving ? (
              <>
                <div className={styles.loadingSpinner} />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Check size={16} />
                <span>Save Changes</span>
              </>
            )}
          </button>
        </div>

        <div className={styles.settingsGrid}>
          {/* Connected Chains Section */}
          <div className={styles.settingsCard}>
            <div className={styles.cardHeader}>
              <div className={styles.cardHeaderLeft}>
                <div className={styles.cardIcon}>
                  <Globe size={18} />
                </div>
                <div>
                  <h2 className={styles.cardTitle}>Connected Chains</h2>
                  <p className={styles.cardDescription}>Manage your blockchain connections</p>
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

                    {isConnected && chainAddress && (
                      <div className={styles.chainAddress}>
                        <span className={styles.addressLabel}>Connected as</span>
                        <span className={styles.addressValue}>
                          {chainAddress.slice(0, 6)}...{chainAddress.slice(-4)}
                        </span>
                      </div>
                    )}

                    <div className={styles.chainCardFooter}>
                      {isConnected ? (
                        <button
                          onClick={() => handleDisconnectChain(chain)}
                          className={`${styles.chainButton} ${styles.disconnectButton}`}
                        >
                          <X size={14} />
                          <span>Disconnect</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleConnectChain(chain)}
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

          {/* Email & Notifications Section */}
          <div className={styles.settingsCard}>
            <div className={styles.cardHeader}>
              <div className={styles.cardHeaderLeft}>
                <div className={styles.cardIcon}>
                  <Mail size={18} />
                </div>
                <div>
                  <h2 className={styles.cardTitle}>Email Notifications</h2>
                  <p className={styles.cardDescription}>Stay updated on your trades</p>
                </div>
              </div>
            </div>

            <div className={styles.emailGroup}>
              <div className={styles.inputWrapper}>
                <input
                  type="email"
                  value={email}
                  onChange={handleEmailChange}
                  placeholder="your@email.com"
                  className={styles.emailInput}
                />
                {email && !emailVerified && (
                  <button
                    onClick={handleVerifyEmail}
                    className={styles.verifyButton}
                  >
                    Verify
                  </button>
                )}
              </div>
              {emailVerified && (
                <div className={styles.verifiedBadge}>
                  <Check size={12} />
                  <span>Verified</span>
                </div>
              )}
            </div>

            <div className={styles.notificationGrid}>
              {Object.entries(preferences.notifications.email).map(([key, value]) => (
                <label key={key} className={styles.toggleItem}>
                  <span className={styles.toggleLabel}>
                    {key.replace(/([A-Z])/g, " $1").trim()}
                  </span>
                  <div className={styles.toggleSwitch}>
                    <input
                      type="checkbox"
                      checked={value}
                      onChange={(e) => setPreferences((prev) => ({
                        ...prev,
                        notifications: {
                          email: {
                            ...prev.notifications.email,
                            [key]: e.target.checked
                          }
                        }
                      }))}
                      className={styles.toggleInput}
                    />
                    <span className={styles.toggleSlider} />
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Appearance Section */}
          <div className={styles.settingsCard}>
            <div className={styles.cardHeader}>
              <div className={styles.cardHeaderLeft}>
                <div className={styles.cardIcon}>
                  <Palette size={18} />
                </div>
                <div>
                  <h2 className={styles.cardTitle}>Appearance</h2>
                  <p className={styles.cardDescription}>Customize your interface</p>
                </div>
              </div>
            </div>

            <div className={styles.selectGroup}>
              <div className={styles.selectWrapper}>
                <label className={styles.selectLabel}>Theme</label>
                <select
                  value={preferences.theme}
                  onChange={(e) => setPreferences((prev) => ({ ...prev, theme: e.target.value }))}
                  className={styles.selectInput}
                >
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                  <option value="system">System</option>
                </select>
              </div>

              <div className={styles.selectWrapper}>
                <label className={styles.selectLabel}>Default View</label>
                <select
                  value={preferences.defaultView}
                  onChange={(e) => setPreferences((prev) => ({ ...prev, defaultView: e.target.value }))}
                  className={styles.selectInput}
                >
                  <option value="trading">Trading</option>
                  <option value="portfolio">Portfolio</option>
                  <option value="analytics">Analytics</option>
                </select>
              </div>
            </div>

            <label className={styles.toggleItem}>
              <span className={styles.toggleLabel}>Show balance in navigation</span>
              <div className={styles.toggleSwitch}>
                <input
                  type="checkbox"
                  checked={preferences.privacy.showBalanceInNav}
                  onChange={(e) => setPreferences((prev) => ({
                    ...prev,
                    privacy: {
                      ...prev.privacy,
                      showBalanceInNav: e.target.checked
                    }
                  }))}
                  className={styles.toggleInput}
                />
                <span className={styles.toggleSlider} />
              </div>
            </label>

            <div className={styles.chartSummarySection}>
              {chartSummary.map((item) => (
                <div key={item.surfaceKey} className={styles.chartSurfaceCard}>
                  <div className={styles.chartSurfaceTitle}>{item.label}</div>
                  <div className={styles.chartSurfaceMeta}>
                    <span>{item.timeframe}</span>
                    <span>{item.chartType}</span>
                    <span>{item.activeTool}</span>
                  </div>
                  <div className={styles.chartSurfaceIndicators}>Indicators: {item.indicators.join(", ") || "none"}</div>
                </div>
              ))}

              <div className={styles.indicatorListWrap}>
                <div className={styles.indicatorListTitle}>All Indicators</div>
                <ul className={styles.indicatorList}>
                  {indicatorList.map((indicator) => (
                    <li key={indicator.id} className={styles.indicatorListItem}>
                      <div>
                        <div className={styles.indicatorName}>{indicator.label}</div>
                        <div className={styles.indicatorDescription}>{indicator.description}</div>
                      </div>
                      <span className={`${styles.indicatorStatus} ${indicator.enabled ? styles.indicatorEnabled : styles.indicatorDisabled}`}>
                        {indicator.implemented ? (indicator.enabled ? "enabled" : "disabled") : "coming soon"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Trading Preferences Section */}
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
                onChange={(e) => setPreferences((prev) => ({
                  ...prev,
                  trading: {
                    ...prev.trading,
                    slippageTolerance: parseFloat(e.target.value)
                  }
                }))}
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
                onChange={(e) => setPreferences((prev) => ({
                  ...prev,
                  trading: {
                    ...prev.trading,
                    defaultOrderType: e.target.value
                  }
                }))}
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
                  onChange={(e) => setPreferences((prev) => ({
                    ...prev,
                    trading: {
                      ...prev.trading,
                      showConfirmationDialogs: e.target.checked
                    }
                  }))}
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
                  onChange={(e) => setPreferences((prev) => ({
                    ...prev,
                    privacy: {
                      ...prev.privacy,
                      shareTradingActivity: e.target.checked
                    }
                  }))}
                  className={styles.toggleInput}
                />
                <span className={styles.toggleSlider} />
              </div>
            </label>
          </div>

          {/* Active Chains Section */}
          <div className={styles.settingsCard}>
            <div className={styles.cardHeader}>
              <div className={styles.cardHeaderLeft}>
                <div className={styles.cardIcon}>
                  <Shield size={18} />
                </div>
                <div>
                  <h2 className={styles.cardTitle}>Active Chains</h2>
                  <p className={styles.cardDescription}>Choose which chains to display</p>
                </div>
              </div>
            </div>

            <div className={styles.chainsSelectGrid}>
              {availableChains.map((chain) => (
                <label key={chain.id} className={styles.chainSelectItem}>
                  <input
                    type="checkbox"
                    checked={preferences.enabledChains?.includes(chain.id)}
                    onChange={(e) => {
                      const updated = e.target.checked
                        ? [...(preferences.enabledChains || []), chain.id]
                        : (preferences.enabledChains || []).filter((id) => id !== chain.id);

                      setPreferences((prev) => ({
                        ...prev,
                        enabledChains: updated
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
      </main>
    </div>
  );
}
