"use client";

import { useState, useEffect, useMemo, useRef, type ComponentType } from "react";
import { useUser } from "@/contexts/UserContext";
import { useChainContext } from "@/contexts/ChainContext";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { patchUserPreferencesByWallet, updateUserByWallet, UserPreferences } from "@/lib/api/users";
import { CHART_SURFACE_LABELS, DEFAULT_CHART_PREFERENCES } from "@/lib/chartPreferences";
import { CHART_INDICATORS } from "@/components/charts/indicators";
import { useTheme, type ThemeDesign, type ThemeMode } from "@/contexts/ThemeContext";
import { Settings, User, Globe, Mail, Palette, BarChart3, TrendingUp, Check } from "lucide-react";
import {
  AccountSection,
  ChainsSection,
  NotificationsSection,
  ThemeSection,
  ChartLayoutSection,
  TradingPreferencesSection,
  type ChartSummaryItem,
  type IndicatorListItem,
  type SettingsSectionId,
} from "./sections";
import styles from "./SettingsPage.module.css";

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "dark",
  themeMode: "dark",
  themeDesign: "futuristic",
  defaultView: "trading",
  notifications: {
    email: {
      tradeExecuted: true,
      orderFilled: true,
      priceAlerts: true,
      securityAlerts: true,
      newsletter: false,
    },
  },
  trading: {
    slippageTolerance: 0.5,
    defaultOrderType: "market",
    showConfirmationDialogs: true,
    favoritePairs: [],
  },
  privacy: {
    showBalanceInNav: true,
    shareTradingActivity: false,
  },
  enabledChains: [1, 8453],
  chart: DEFAULT_CHART_PREFERENCES,
};

const SECTION_ITEMS: Array<{
  id: SettingsSectionId;
  title: string;
  description: string;
  icon: ComponentType<{ size?: number }>;
}> = [
  { id: "account", title: "Account", description: "Email, username, profile", icon: User },
  { id: "chains", title: "Chains", description: "Connected and active chains", icon: Globe },
  { id: "notifications", title: "Notifications", description: "Email alerts and updates", icon: Mail },
  { id: "theme", title: "Theme", description: "App appearance controls", icon: Palette },
  { id: "chartLayout", title: "Chart Layout", description: "Indicators and chart defaults", icon: BarChart3 },
  { id: "trading", title: "Trading", description: "Order and risk preferences", icon: TrendingUp },
];

export default function SettingsPage() {
  const { user, loading, refreshUser } = useUser();
  const { availableChains, setSelectedChain } = useChainContext();
  const { address } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { initFromPreferences } = useTheme();
  const themeDraftDirtyRef = useRef(false);

  const [activeSection, setActiveSection] = useState<SettingsSectionId>("account");
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [isVerifiedByCoinbase, setIsVerifiedByCoinbase] = useState(false);
  const [connectedChains, setConnectedChains] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const markThemeDraftDirty = () => {
    themeDraftDirtyRef.current = true;
  };

  const chartSummary = useMemo<ChartSummaryItem[]>(() => {
    const chartPrefs = preferences.chart || DEFAULT_CHART_PREFERENCES;
    return Object.entries(chartPrefs).map(([surfaceKey, value]) => ({
      surfaceKey,
      label: CHART_SURFACE_LABELS[surfaceKey as keyof typeof CHART_SURFACE_LABELS],
      timeframe: value.timeframe,
      chartType: value.chartType,
      indicators: value.indicators,
      activeTool: value.activeTool,
    }));
  }, [preferences.chart]);

  const indicatorList = useMemo<IndicatorListItem[]>(() => {
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
      implemented: indicator.implemented,
    }));
  }, [preferences.chart]);

  useEffect(() => {
    if (user?.preferences) {
      const incoming = user.preferences;
      const savedDesign = (incoming.themeDesign as ThemeDesign | undefined) || "futuristic";
      const savedMode = (incoming.themeMode as ThemeMode | undefined) || "dark";

      setPreferences((prev) => ({
        ...DEFAULT_PREFERENCES,
        ...incoming,
        themeDesign: themeDraftDirtyRef.current ? prev.themeDesign : savedDesign,
        themeMode: themeDraftDirtyRef.current ? prev.themeMode : savedMode,
        notifications: {
          ...DEFAULT_PREFERENCES.notifications,
          ...(incoming.notifications || {}),
          email: {
            ...DEFAULT_PREFERENCES.notifications.email,
            ...(incoming.notifications?.email || {}),
          },
        },
        trading: {
          ...DEFAULT_PREFERENCES.trading,
          ...(incoming.trading || {}),
        },
        privacy: {
          ...DEFAULT_PREFERENCES.privacy,
          ...(incoming.privacy || {}),
        },
        enabledChains: Array.isArray(incoming.enabledChains)
          ? incoming.enabledChains.map((id) => Number(id)).filter((id) => Number.isFinite(id))
          : DEFAULT_PREFERENCES.enabledChains,
        chart: {
          ...DEFAULT_CHART_PREFERENCES,
          ...(incoming.chart || {}),
        },
      }));

      if (!themeDraftDirtyRef.current) {
        initFromPreferences(savedDesign, savedMode);
      }
    } else {
      setPreferences(DEFAULT_PREFERENCES);
    }

    setEmail(user?.email || "");
    setUsername(user?.username || "");
    setEmailVerified(Boolean(user?.email_verified));
    setIsVerifiedByCoinbase(Boolean(user?.is_verified_by_coinbase));

    if (user?.chain_addresses && typeof user.chain_addresses === "object") {
      setConnectedChains(user.chain_addresses as Record<string, string>);
    } else {
      setConnectedChains({});
    }
  }, [user, initFromPreferences]);

  const handleConnectChain = async (chain: { id: number; label: string; slug: string }) => {
    try {
      const connector = connectors[0];

      if (connector) {
        setSelectedChain(chain.id);
        await connect({ connector });
        setFeedback(`Connecting to ${chain.label}...`);
      }
    } catch {
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
          chain_addresses: updatedChainAddresses,
        });
        if (!updated) throw new Error("Failed chain update");
        setConnectedChains(updatedChainAddresses);
        await refreshUser();
      }

      setFeedback(`Disconnected from ${chain.label}`);
    } catch {
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
      const [preferencesResult, profileResult] = await Promise.all([
        patchUserPreferencesByWallet(address, preferences),
        updateUserByWallet(address, {
          email,
          username,
          email_verified: emailVerified,
          is_verified_by_coinbase: isVerifiedByCoinbase,
        }),
      ]);

      if (!preferencesResult || !profileResult) {
        throw new Error("Save failed");
      }

      themeDraftDirtyRef.current = false;
      await refreshUser();
      setFeedback("Preferences saved successfully");
    } catch {
      setFeedback("Failed to save preferences");
    } finally {
      setIsSaving(false);
    }
  };

  const handleVerifyEmail = () => {
    setEmailVerified(true);
    setFeedback("Verification email sent");
  };

  const renderSection = () => {
    if (activeSection === "account") {
      return (
        <AccountSection
          email={email}
          setEmail={setEmail}
          username={username}
          setUsername={setUsername}
          emailVerified={emailVerified}
          setEmailVerified={setEmailVerified}
          isVerifiedByCoinbase={isVerifiedByCoinbase}
          setIsVerifiedByCoinbase={setIsVerifiedByCoinbase}
          onVerifyEmail={handleVerifyEmail}
        />
      );
    }

    if (activeSection === "chains") {
      return (
        <ChainsSection
          preferences={preferences}
          setPreferences={setPreferences}
          availableChains={availableChains}
          connectedChains={connectedChains}
          onConnectChain={handleConnectChain}
          onDisconnectChain={handleDisconnectChain}
        />
      );
    }

    if (activeSection === "notifications") {
      return <NotificationsSection preferences={preferences} setPreferences={setPreferences} />;
    }

    if (activeSection === "theme") {
      return (
        <ThemeSection
          preferences={preferences}
          setPreferences={setPreferences}
          onThemeDraftChange={markThemeDraftDirty}
        />
      );
    }

    if (activeSection === "chartLayout") {
      return <ChartLayoutSection chartSummary={chartSummary} indicatorList={indicatorList} />;
    }

    return <TradingPreferencesSection preferences={preferences} setPreferences={setPreferences} />;
  };

  return (
    <div className={styles.pageContainer}>
      <div className={styles.gradientBg} />

      <main className={styles.main}>
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
          <button onClick={savePreferences} disabled={isSaving || loading} className={styles.saveButton}>
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

        <div className={styles.settingsLayout}>
          <aside className={styles.sidebarCard}>
            <div className={styles.sidebarHeader}>Settings</div>
            <div className={styles.sidebarNav}>
              {SECTION_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveSection(item.id)}
                    className={`${styles.sidebarButton} ${isActive ? styles.sidebarButtonActive : ""}`}
                  >
                    <span className={styles.sidebarIcon}>
                      <Icon size={16} />
                    </span>
                    <span className={styles.sidebarMeta}>
                      <span className={styles.sidebarTitle}>{item.title}</span>
                      <span className={styles.sidebarDescription}>{item.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className={styles.sectionPane}>{renderSection()}</section>
        </div>
      </main>
    </div>
  );
}
