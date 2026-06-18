"use client";

import { useState, useEffect } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { useTheme } from "@/contexts/ThemeContext";
import styles from "./AdminApiKeys.module.css";

interface ApiKey {
  id: string;
  owner_name: string;
  owner_email: string;
  description: string;
  tier: string;
  rate_limit_per_minute: number;
  daily_spend_limit_usd: number | null;
  balance_usd: number;
  status: string;
  usage_count: number;
  last_used_at: string | null;
  requester_wallet: string;
  created_at: string;
  updated_at: string;
  kyc_status?: string;
  total_deposits?: number;
}

interface Deposit {
  id: string;
  api_key_id: string;
  wallet_address: string;
  amount_usdc: number;
  tx_hash: string;
  verified: boolean;
  created_at: string;
  owner_name: string;
  tier: string;
  requester_wallet: string;
}

export default function AdminApiKeysPage() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { mode, design } = useTheme();

  const [activeTab, setActiveTab] = useState<"keys" | "deposits" | "enterprise" | "analytics">("keys");
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [pendingDeposits, setPendingDeposits] = useState<Deposit[]>([]);
  const [enterpriseApps, setEnterpriseApps] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [adminKey, setAdminKey] = useState("");

  const isAdmin = address?.toLowerCase() === process.env.NEXT_PUBLIC_ADMIN_WALLET_ADDRESS?.toLowerCase();

  useEffect(() => {
    if (isConnected && isAdmin && adminKey) {
      loadData();
    }
  }, [isConnected, isAdmin, adminKey, activeTab]);

  const signAdminMessage = async () => {
    if (!address) return null;

    const message = JSON.stringify({
      action: "ADMIN_API_KEY_MANAGEMENT",
      wallet_address: address.toLowerCase(),
      timestamp: Math.floor(Date.now() / 1000),
    });

    const signature = await signMessageAsync({ message });
    return { message, signature };
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const auth = await signAdminMessage();
      if (!auth) return;

      if (activeTab === "keys") {
        await loadApiKeys(auth);
      } else if (activeTab === "deposits") {
        await loadPendingDeposits(auth);
      } else if (activeTab === "enterprise") {
        await loadEnterpriseApps(auth);
      }
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadApiKeys = async (auth: { message: string; signature: string }) => {
    const res = await fetch(`/api/admin/api-keys/keys?admin_wallet_address=${address}`, {
      headers: {
        "x-admin-message": auth.message,
        "x-admin-signature": auth.signature,
      },
    });

    const data = await res.json();
    if (data.success) {
      setApiKeys(data.keys);
    }
  };

  const loadPendingDeposits = async (auth: { message: string; signature: string }) => {
    const res = await fetch(`/api/admin/api-keys/deposits/pending?admin_wallet_address=${address}`, {
      headers: {
        "x-admin-message": auth.message,
        "x-admin-signature": auth.signature,
      },
    });

    const data = await res.json();
    if (data.success) {
      setPendingDeposits(data.deposits);
    }
  };

  const loadEnterpriseApps = async (auth: { message: string; signature: string }) => {
    const res = await fetch(`/api/admin/api-keys/pending-enterprise?admin_wallet_address=${address}`, {
      headers: {
        "x-admin-message": auth.message,
        "x-admin-signature": auth.signature,
      },
    });

    const data = await res.json();
    if (data.success) {
      setEnterpriseApps(data.applications);
    }
  };

  const handleVerifyDeposit = async (depositId: string) => {
    try {
      setLoading(true);
      setFeedback(null);

      const auth = await signAdminMessage();
      if (!auth) return;

      const res = await fetch(`/api/admin/api-keys/deposits/${depositId}/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-message": auth.message,
          "x-admin-signature": auth.signature,
        },
        body: JSON.stringify({ admin_wallet_address: address }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed");

      setFeedback("✅ Deposit verified successfully!");
      loadData();
    } catch (error: any) {
      setFeedback(`❌ ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!confirm("Are you sure you want to revoke this API key?")) return;

    try {
      setLoading(true);
      setFeedback(null);

      const auth = await signAdminMessage();
      if (!auth) return;

      const res = await fetch(`/api/admin/api-keys/keys/${keyId}/revoke`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-message": auth.message,
          "x-admin-signature": auth.signature,
        },
        body: JSON.stringify({ admin_wallet_address: address }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Revoke failed");

      setFeedback("✅ API key revoked successfully!");
      loadData();
    } catch (error: any) {
      setFeedback(`❌ ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isConnected) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <h1 className={styles.title}>🔐 Admin: API Keys</h1>
          <p className={styles.subtitle}>Connect your admin wallet to manage API keys</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <h1 className={styles.title}>🔐 Admin: API Keys</h1>
          <p className={styles.subtitle}>Access Denied</p>
          <p className={styles.error}>You are not authorized to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>🔐 API Key Management</h1>
          <p className={styles.subtitle}>Admin Dashboard</p>
        </div>
      </div>

      {feedback && (
        <div className={feedback.includes("✅") ? styles.successMessage : styles.errorMessage}>
          {feedback}
        </div>
      )}

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === "keys" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("keys")}
        >
          All Keys ({apiKeys.length})
        </button>
        <button
          className={`${styles.tab} ${activeTab === "deposits" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("deposits")}
        >
          Pending Deposits ({pendingDeposits.length})
        </button>
        <button
          className={`${styles.tab} ${activeTab === "enterprise" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("enterprise")}
        >
          Enterprise Apps ({enterpriseApps.length})
        </button>
        <button
          className={`${styles.tab} ${activeTab === "analytics" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("analytics")}
        >
          Analytics
        </button>
      </div>

      {/* All Keys Tab */}
      {activeTab === "keys" && (
        <div className={styles.section}>
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Tier</th>
                  <th>Wallet</th>
                  <th>Balance</th>
                  <th>Usage</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {apiKeys.map((key) => (
                  <tr key={key.id}>
                    <td>
                      <div className={styles.projectInfo}>
                        <strong>{key.owner_name || "Unnamed"}</strong>
                        <small>{key.description}</small>
                      </div>
                    </td>
                    <td>
                      <span className={`${styles.tierBadge} ${styles[key.tier.toLowerCase()]}`}>
                        {key.tier}
                      </span>
                    </td>
                    <td>
                      <code className={styles.wallet}>{key.requester_wallet?.slice(0, 10)}...</code>
                    </td>
                    <td>${key.balance_usd?.toFixed(2) || "0.00"}</td>
                    <td>{key.usage_count || 0}</td>
                    <td>
                      <span className={`${styles.statusBadge} ${styles[key.status.toLowerCase()]}`}>
                        {key.status}
                      </span>
                    </td>
                    <td>
                      <button
                        className={styles.revokeButton}
                        onClick={() => handleRevokeKey(key.id)}
                        disabled={key.status === "REVOKED"}
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pending Deposits Tab */}
      {activeTab === "deposits" && (
        <div className={styles.section}>
          {pendingDeposits.length === 0 ? (
            <div className={styles.emptyState}>
              <p>No pending deposits to verify</p>
            </div>
          ) : (
            <div className={styles.depositsList}>
              {pendingDeposits.map((deposit) => (
                <div key={deposit.id} className={styles.depositCard}>
                  <div className={styles.depositHeader}>
                    <div>
                      <h3>{deposit.owner_name || "Unnamed Project"}</h3>
                      <p className={styles.depositWallet}>{deposit.requester_wallet}</p>
                    </div>
                    <span className={`${styles.tierBadge} ${styles[deposit.tier.toLowerCase()]}`}>
                      {deposit.tier}
                    </span>
                  </div>
                  <div className={styles.depositDetails}>
                    <div className={styles.depositInfo}>
                      <span className={styles.label}>Amount:</span>
                      <span className={styles.value}>${deposit.amount_usdc.toFixed(2)} USDC</span>
                    </div>
                    <div className={styles.depositInfo}>
                      <span className={styles.label}>TX Hash:</span>
                      <code className={styles.txHash}>{deposit.tx_hash.slice(0, 20)}...</code>
                    </div>
                    <div className={styles.depositInfo}>
                      <span className={styles.label}>Submitted:</span>
                      <span className={styles.value}>{new Date(deposit.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                  <button
                    className={styles.verifyButton}
                    onClick={() => handleVerifyDeposit(deposit.id)}
                    disabled={loading}
                  >
                    {loading ? "Verifying..." : "Verify Deposit"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Enterprise Apps Tab */}
      {activeTab === "enterprise" && (
        <div className={styles.section}>
          {enterpriseApps.length === 0 ? (
            <div className={styles.emptyState}>
              <p>No Enterprise applications</p>
            </div>
          ) : (
            <div className={styles.enterpriseList}>
              {enterpriseApps.map((app) => (
                <div key={app.id} className={styles.enterpriseCard}>
                  <div className={styles.enterpriseHeader}>
                    <div>
                      <h3>{app.owner_name || "Unnamed Project"}</h3>
                      <p>{app.description}</p>
                    </div>
                    <span className={`${styles.kycBadge} ${app.kyc_status === "KYC_VERIFIED" ? styles.verified : styles.pending}`}>
                      {app.kyc_status}
                    </span>
                  </div>
                  <div className={styles.enterpriseStats}>
                    <div className={styles.stat}>
                      <span className={styles.statLabel}>Wallet</span>
                      <code className={styles.statValue}>{app.requester_wallet?.slice(0, 16)}...</code>
                    </div>
                    <div className={styles.stat}>
                      <span className={styles.statLabel}>Deposits</span>
                      <span className={styles.statValue}>${app.total_deposits?.toFixed(2) || "0.00"}</span>
                    </div>
                    <div className={styles.stat}>
                      <span className={styles.statLabel}>Usage</span>
                      <span className={styles.statValue}>{app.usage_count || 0} requests</span>
                    </div>
                    <div className={styles.stat}>
                      <span className={styles.statLabel}>Rate Limit</span>
                      <span className={styles.statValue}>{app.rate_limit_per_minute} req/min</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Analytics Tab */}
      {activeTab === "analytics" && (
        <div className={styles.section}>
          <div className={styles.analyticsGrid}>
            <div className={styles.analyticsCard}>
              <h3>Total Keys</h3>
              <p className={styles.bigNumber}>{apiKeys.length}</p>
            </div>
            <div className={styles.analyticsCard}>
              <h3>Pending Deposits</h3>
              <p className={styles.bigNumber}>{pendingDeposits.length}</p>
            </div>
            <div className={styles.analyticsCard}>
              <h3>Enterprise Apps</h3>
              <p className={styles.bigNumber}>{enterpriseApps.length}</p>
            </div>
            <div className={styles.analyticsCard}>
              <h3>Total Usage</h3>
              <p className={styles.bigNumber}>
                {apiKeys.reduce((sum, key) => sum + (key.usage_count || 0), 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
