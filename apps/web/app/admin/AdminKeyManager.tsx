"use client";

import { FormEvent, useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import styles from "./adminDashboard.module.css";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001").replace(/\/$/, "") + "/api";
const ADMIN_API_ACTION = process.env.NEXT_PUBLIC_ADMIN_API_ACTION || "ADMIN_API_KEY_MANAGEMENT";

interface DeveloperApiKey {
  id: string;
  owner_name?: string | null;
  owner_email?: string | null;
  description?: string | null;
  allowed_endpoints?: string[];
  rate_limit_per_minute?: number;
  status?: string;
  created_at?: string;
  updated_at?: string;
  last_used_at?: string | null;
  usage_count?: number;
}

export default function AdminKeyManager() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [keys, setKeys] = useState<DeveloperApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"success" | "error" | "info" | null>(null);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [description, setDescription] = useState("");
  const [allowedEndpoints, setAllowedEndpoints] = useState("/api/binance,/api/coinbase,/api/coinranking,/api/1inch,/api/klines,/api/oracle,/api/pyth,/api/aggregator");
  const [rateLimit, setRateLimit] = useState("120");

  const getAdminHeaders = async () => {
    if (!isConnected || !address) {
      throw new Error("Connect your admin wallet before calling this API.");
    }

    const payload = {
      action: ADMIN_API_ACTION,
      wallet_address: address.toLowerCase(),
      timestamp: Math.floor(Date.now() / 1000),
    };
    const messageText = JSON.stringify(payload);
    const signature = await signMessageAsync({ message: messageText });

    return {
      "Content-Type": "application/json",
      "x-admin-wallet-address": address,
      "x-admin-message": messageText,
      "x-admin-signature": signature,
    };
  };

  const showStatus = (type: "success" | "error" | "info", text: string) => {
    setMessageType(type);
    setMessage(text);
    setTimeout(() => {
      setMessage(null);
      setMessageType(null);
    }, 6000);
  };

  const fetchKeys = async () => {
    setLoading(true);
    setNewApiKey(null);
    try {
      const headers = await getAdminHeaders();
      const res = await fetch(`${API_BASE}/api/api-keys`, {
        method: "GET",
        headers,
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Failed to fetch API keys");
      }
      setKeys(data.data || []);
    } catch (error) {
      showStatus("error", error instanceof Error ? error.message : "Unable to load keys");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isConnected) {
      void fetchKeys();
    }
  }, [isConnected, address]);

  const handleCreateKey = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setNewApiKey(null);

    try {
      const headers = await getAdminHeaders();
      const endpointList = allowedEndpoints
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      const rateLimitValue = Number(rateLimit) || 120;

      const res = await fetch(`${API_BASE}/api/api-keys`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          owner_name: ownerName || null,
          owner_email: ownerEmail || null,
          description: description || null,
          allowed_endpoints: endpointList,
          rate_limit_per_minute: rateLimitValue,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Unable to create API key");
      }
      setNewApiKey(data.data.raw_api_key);
      showStatus("success", "Developer API key created successfully. Copy it now, it will not be shown again.");
      setOwnerName("");
      setOwnerEmail("");
      setDescription("");
      await fetchKeys();
    } catch (error) {
      showStatus("error", error instanceof Error ? error.message : "Failed to create API key");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateKeyStatus = async (id: string, status: string) => {
    setLoading(true);
    try {
      const headers = await getAdminHeaders();
      const res = await fetch(`${API_BASE}/api/api-keys/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Unable to update API key");
      }
      showStatus("success", `API key ${status.toLowerCase()} successfully.`);
      await fetchKeys();
    } catch (error) {
      showStatus("error", error instanceof Error ? error.message : "Failed to update API key");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.manager}>
      <div className={styles.headerCard}>
        <div>
          <p className={styles.subtitle}>Admin API Key Dashboard</p>
          <h2>Manage Developer API Keys</h2>
          <p className={styles.description}>
            Issue, revoke, and configure rate limits for developer API keys used by external clients.
            Every admin action is authenticated with a wallet-signed proof.
          </p>
        </div>
        <div className={styles.accountBlock}>
          <p className={styles.accountLabel}>Connected admin wallet</p>
          <p className={styles.accountValue}>{isConnected && address ? address : "Not connected"}</p>
        </div>
      </div>

      {message && (
        <div className={`${styles.statusBanner} ${messageType === "success" ? styles.success : styles.error}`}>
          {message}
        </div>
      )}

      <section className={styles.section}>
        <h3>Create a new developer key</h3>
        <form className={styles.formGrid} onSubmit={handleCreateKey}>
          <label className={styles.fieldLabel}>
            Owner name
            <input
              className={styles.fieldInput}
              value={ownerName}
              onChange={(event) => setOwnerName(event.target.value)}
              placeholder="Acme Analytics"
            />
          </label>

          <label className={styles.fieldLabel}>
            Owner email
            <input
              className={styles.fieldInput}
              type="email"
              value={ownerEmail}
              onChange={(event) => setOwnerEmail(event.target.value)}
              placeholder="developer@acme.com"
            />
          </label>

          <label className={styles.fieldLabel}>
            Description
            <textarea
              className={styles.fieldTextarea}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Project, team or integration notes"
            />
          </label>

          <label className={styles.fieldLabel}>
            Allowed endpoints
            <input
              className={styles.fieldInput}
              value={allowedEndpoints}
              onChange={(event) => setAllowedEndpoints(event.target.value)}
              placeholder="/api/binance,/api/coinbase,..."
            />
            <span className={styles.fieldHint}>
              Comma-separated list of enabled routes. Leave empty to allow all developer endpoints.
            </span>
          </label>

          <label className={styles.fieldLabel}>
            Rate limit per minute
            <input
              className={styles.fieldInput}
              type="number"
              min="1"
              value={rateLimit}
              onChange={(event) => setRateLimit(event.target.value)}
              placeholder="120"
            />
            <span className={styles.fieldHint}>
              Requests per minute for this API key.
            </span>
          </label>

          <button type="submit" className={styles.primaryButton} disabled={!isConnected || loading}>
            {loading ? "Processing..." : "Create developer key"}
          </button>
        </form>

        {newApiKey && (
          <div className={styles.secretBlock}>
            <strong>New API key</strong>
            <code className={styles.secretValue}>{newApiKey}</code>
            <p className={styles.fieldHint}>
              Copy this secret now. It will not be shown again.
            </p>
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h3>Issued API keys</h3>
          <button className={styles.secondaryButton} onClick={fetchKeys} disabled={loading}>
            Refresh list
          </button>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Owner</th>
                <th>Endpoints</th>
                <th>Rate limit</th>
                <th>Status</th>
                <th>Usage</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id}>
                  <td>{key.id}</td>
                  <td>
                    <div>{key.owner_name || "—"}</div>
                    <div className={styles.smallText}>{key.owner_email || "—"}</div>
                  </td>
                  <td>
                    {(key.allowed_endpoints?.length ? key.allowed_endpoints.join(", ") : "All developer endpoints")}
                  </td>
                  <td>{key.rate_limit_per_minute ?? 120} / min</td>
                  <td>{key.status}</td>
                  <td>
                    <div>{key.usage_count ?? 0} requests</div>
                    <div className={styles.smallText}>{key.last_used_at ? new Date(key.last_used_at).toLocaleString() : "never"}</div>
                  </td>
                  <td className={styles.actionCell}>
                    {key.status !== "REVOKED" && (
                      <button onClick={() => void handleUpdateKeyStatus(key.id, "REVOKED")} className={styles.revokeButton}>
                        Revoke
                      </button>
                    )}
                    {key.status === "REVOKED" && (
                      <button onClick={() => void handleUpdateKeyStatus(key.id, "ACTIVE")} className={styles.primarySmallButton}>
                        Reactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {keys.length === 0 && !loading && <p className={styles.emptyState}>No developer keys have been issued yet.</p>}
        </div>
      </section>
    </div>
  );
}
