"use client";

import { useState, useEffect } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { useTheme } from "@/contexts/ThemeContext";
import styles from "./DeveloperApiKeys.module.css";

interface Tier {
  id: string;
  name: string;
  description: string;
  rate_limit: number;
  daily_spend_limit: number | null;
  cost: string;
  requires_kyc: boolean;
  requires_deposit: boolean;
  min_deposit?: number;
  features: string[];
}

interface ApiKey {
  id: string;
  owner_name: string;
  description: string;
  tier: string;
  rate_limit_per_minute: number;
  daily_spend_limit_usd: number | null;
  balance_usd: number;
  status: string;
  usage_count: number;
  last_used_at: string | null;
  created_at: string;
}

export default function DeveloperApiKeys() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { mode, design } = useTheme();

  const [tiers, setTiers] = useState<Tier[]>([]);
  const [myKeys, setMyKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [selectedKeyForDeposit, setSelectedKeyForDeposit] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedKeyForDelete, setSelectedKeyForDelete] = useState<ApiKey | null>(null);

  // Form state
  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [txHash, setTxHash] = useState("");
  const [depositAmount, setDepositAmount] = useState("");

  useEffect(() => {
    loadTiers();
    if (isConnected && address) {
      loadMyKeys();
    }
  }, [isConnected, address]);

  const loadTiers = async () => {
    try {
      const res = await fetch("/api/developer/api-keys/tiers");
      const data = await res.json();
      if (data.success) {
        setTiers(data.tiers);
      }
    } catch (error) {
      console.error("Failed to load tiers:", error);
    }
  };

  const loadMyKeys = async () => {
    if (!address) return;

    try {
      const message = JSON.stringify({
        action: "GET_MY_KEYS",
        wallet_address: address.toLowerCase(),
        timestamp: Math.floor(Date.now() / 1000),
      });

      const signature = await signMessageAsync({ message });

      const res = await fetch(
        `/api/developer/api-keys/my-keys?wallet_address=${address}`,
        {
          headers: {
            "x-message": message,
            "x-signature": signature,
          },
        }
      );

      const data = await res.json();
      if (data.success) {
        setMyKeys(data.keys);
      }
    } catch (error) {
      console.error("Failed to load keys:", error);
    }
  };

  const handleRequestKey = async () => {
    if (!address || !selectedTier) return;

    try {
      setLoading(true);
      setFeedback(null);

      const message = JSON.stringify({
        action: "API_KEY_REQUEST",
        wallet_address: address.toLowerCase(),
        timestamp: Math.floor(Date.now() / 1000),
      });

      const signature = await signMessageAsync({ message });

      const res = await fetch("/api/developer/api-keys/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet_address: address,
          tier: selectedTier,
          project_name: projectName,
          description,
          email,
          message,
          signature,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");

      setFeedback(`✅ Success! Your API key: ${data.data.raw_api_key}`);
      setShowRequestModal(false);
      setProjectName("");
      setDescription("");
      setEmail("");
      loadMyKeys();
    } catch (error: any) {
      setFeedback(`❌ ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitDeposit = async () => {
    if (!address || !selectedKeyForDeposit || !txHash || !depositAmount) return;

    try {
      setLoading(true);
      setFeedback(null);

      const message = JSON.stringify({
        action: "SUBMIT_DEPOSIT",
        wallet_address: address.toLowerCase(),
        timestamp: Math.floor(Date.now() / 1000),
      });

      const signature = await signMessageAsync({ message });

      const res = await fetch("/api/developer/api-keys/deposits/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet_address: address,
          api_key_id: selectedKeyForDeposit,
          tx_hash: txHash,
          amount_usdc: parseFloat(depositAmount),
          message,
          signature,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Deposit submission failed");

      setFeedback(`✅ ${data.message}`);
      setShowDepositModal(false);
      setTxHash("");
      setDepositAmount("");
      setTimeout(() => loadMyKeys(), 2000);
    } catch (error: any) {
      setFeedback(`❌ ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteKey = async () => {
    if (!address || !selectedKeyForDelete) return;

    try {
      setLoading(true);
      setFeedback(null);

      const message = JSON.stringify({
        action: "DELETE_API_KEY",
        wallet_address: address.toLowerCase(),
        timestamp: Math.floor(Date.now() / 1000),
      });

      const signature = await signMessageAsync({ message });

      const res = await fetch(`/api/developer/api-keys/${selectedKeyForDelete.id}/revoke`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet_address: address,
          message,
          signature,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete API key");

      setFeedback(`✅ API key "${selectedKeyForDelete.owner_name}" has been revoked successfully`);
      setShowDeleteModal(false);
      setSelectedKeyForDelete(null);
      loadMyKeys();
    } catch (error: any) {
      setFeedback(`❌ ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getTierBadgeClass = (tier: string) => {
    if (tier === "SANDBOX") return styles.tierSandbox;
    if (tier === "PRODUCTION_LITE") return styles.tierLite;
    if (tier === "ENTERPRISE") return styles.tierEnterprise;
    return "";
  };

  if (!isConnected) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <h2 className={styles.title}>🔑 Self-Service API Keys</h2>
          <p className={styles.subtitle}>Connect your wallet to manage API keys</p>
          <div className={styles.connectPrompt}>
            <p>👆 Click "Connect Wallet" in the header to get started</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>🔑 My API Keys</h2>
          <p className={styles.subtitle}>Manage your API access tiers and usage</p>
        </div>
        <button
          className={styles.primaryButton}
          onClick={() => setShowRequestModal(true)}
        >
          + Request New Key
        </button>
      </div>

      {feedback && (
        <div className={feedback.includes("✅") ? styles.successMessage : styles.errorMessage}>
          {feedback}
        </div>
      )}

      {/* My Keys */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Active Keys</h3>
        {myKeys.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No API keys yet. Request your first key to get started!</p>
          </div>
        ) : (
          <div className={styles.keysList}>
            {myKeys.map((key) => (
              <div key={key.id} className={styles.keyCard}>
                <div className={styles.keyHeader}>
                  <div>
                    <h4 className={styles.keyName}>{key.owner_name || "Unnamed Project"}</h4>
                    <p className={styles.keyDescription}>{key.description}</p>
                  </div>
                  <span className={`${styles.tierBadge} ${getTierBadgeClass(key.tier)}`}>
                    {key.tier}
                  </span>
                </div>

                <div className={styles.keyStats}>
                  <div className={styles.stat}>
                    <span className={styles.statLabel}>Rate Limit</span>
                    <span className={styles.statValue}>{key.rate_limit_per_minute} req/min</span>
                  </div>
                  <div className={styles.stat}>
                    <span className={styles.statLabel}>Balance</span>
                    <span className={styles.statValue}>${key.balance_usd?.toFixed(2) || "0.00"}</span>
                  </div>
                  <div className={styles.stat}>
                    <span className={styles.statLabel}>Usage</span>
                    <span className={styles.statValue}>{key.usage_count || 0} requests</span>
                  </div>
                  <div className={styles.stat}>
                    <span className={styles.statLabel}>Status</span>
                    <span className={`${styles.statusBadge} ${styles[key.status.toLowerCase()]}`}>
                      {key.status}
                    </span>
                  </div>
                </div>

                <div className={styles.keyActions}>
                  {key.tier !== "SANDBOX" && (
                    <button
                      className={styles.secondaryButton}
                      onClick={() => {
                        setSelectedKeyForDeposit(key.id);
                        setShowDepositModal(true);
                      }}
                    >
                      Add Credits
                    </button>
                  )}
                  <button
                    className={styles.dangerButton}
                    onClick={() => {
                      setSelectedKeyForDelete(key);
                      setShowDeleteModal(true);
                    }}
                  >
                    🗑️ Delete Key
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Available Tiers */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Available Tiers</h3>
        <div className={styles.tiersGrid}>
          {tiers.map((tier) => (
            <div key={tier.id} className={styles.tierCard}>
              <div className={styles.tierHeader}>
                <h4 className={styles.tierName}>{tier.name}</h4>
                <span className={`${styles.tierBadge} ${getTierBadgeClass(tier.id)}`}>
                  {tier.cost}
                </span>
              </div>
              <p className={styles.tierDescription}>{tier.description}</p>
              <ul className={styles.tierFeatures}>
                {tier.features.map((feature, idx) => (
                  <li key={idx}>✓ {feature}</li>
                ))}
              </ul>
              <button
                className={styles.tierButton}
                onClick={() => {
                  setSelectedTier(tier.id);
                  setShowRequestModal(true);
                }}
              >
                Request {tier.name}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Request Modal */}
      {showRequestModal && (
        <div className={styles.modal} onClick={() => setShowRequestModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Request API Key</h3>
            <div className={styles.formGroup}>
              <label>Project Name</label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="My Awesome Project"
                className={styles.input}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What will you build?"
                className={styles.textarea}
                rows={3}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Email (Optional)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={styles.input}
              />
            </div>
            <div className={styles.modalActions}>
              <button
                className={styles.secondaryButton}
                onClick={() => setShowRequestModal(false)}
              >
                Cancel
              </button>
              <button
                className={styles.primaryButton}
                onClick={handleRequestKey}
                disabled={loading || !projectName}
              >
                {loading ? "Requesting..." : "Request Key"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className={styles.modal} onClick={() => setShowDeleteModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>⚠️ Delete API Key</h3>
            <p className={styles.modalDescription}>
              Are you sure you want to delete the API key for <strong>{selectedKeyForDelete?.owner_name}</strong>?
            </p>
            <div className={styles.warningBox}>
              <p>⚠️ This action cannot be undone!</p>
              <p>The API key will be permanently revoked and will no longer work for API requests.</p>
            </div>
            <div className={styles.modalActions}>
              <button
                className={styles.secondaryButton}
                onClick={() => {
                  setShowDeleteModal(false);
                  setSelectedKeyForDelete(null);
                }}
              >
                Cancel
              </button>
              <button
                className={styles.dangerButton}
                onClick={handleDeleteKey}
                disabled={loading}
              >
                {loading ? "Deleting..." : "Yes, Delete Key"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deposit Modal */}
      {showDepositModal && (
        <div className={styles.modal} onClick={() => setShowDepositModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Add Credits</h3>
            <p className={styles.modalDescription}>
              Send USDC to our deposit address, then submit the transaction hash below.
            </p>
            <div className={styles.depositAddress}>
              <label>Deposit Address:</label>
              <code>0x1234...5678</code>
              <button className={styles.copyButton}>Copy</button>
            </div>
            <div className={styles.formGroup}>
              <label>Transaction Hash</label>
              <input
                type="text"
                value={txHash}
                onChange={(e) => setTxHash(e.target.value)}
                placeholder="0x..."
                className={styles.input}
              />
            </div>
            <div className={styles.formGroup}>
              <label>Amount (USDC)</label>
              <input
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="100"
                className={styles.input}
              />
            </div>
            <div className={styles.modalActions}>
              <button
                className={styles.secondaryButton}
                onClick={() => setShowDepositModal(false)}
              >
                Cancel
              </button>
              <button
                className={styles.primaryButton}
                onClick={handleSubmitDeposit}
                disabled={loading || !txHash || !depositAmount}
              >
                {loading ? "Submitting..." : "Submit Deposit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
