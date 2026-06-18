"use client";

import { useState, useEffect } from "react";
import styles from "./KycReview.module.css";

const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  "http://localhost:3001"
).replace(/\/$/, "") + "/api";

interface PendingReview {
  review_task_id: string;
  user_id: string;
  identity_hash: string;
  duplicate_of_user_id: string | null;
  status: string;
  created_at: string;
  wallet_address: string;
  kyc_status: string;
  user_created_at: string;
  duplicate_wallet_address: string | null;
}

interface KycDocument {
  data: any;
  created_at: string;
}

export default function KycReviewPage() {
  const [adminKey, setAdminKey] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pendingReviews, setPendingReviews] = useState<PendingReview[]>([]);
  const [selectedReview, setSelectedReview] = useState<PendingReview | null>(null);
  const [userDocument, setUserDocument] = useState<KycDocument | null>(null);
  const [duplicateDocument, setDuplicateDocument] = useState<KycDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [secondarySalt, setSecondarySalt] = useState("");

  const fetchPendingReviews = async () => {
    if (!adminKey) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/onboarding/kyc/reviews/pending`, {
        headers: {
          "x-admin-api-key": adminKey,
        },
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to fetch pending reviews");
      }

      setPendingReviews(data.pending_reviews || []);
      setIsAuthenticated(true);
    } catch (err: any) {
      setError(err.message);
      if (err.message.includes("authorization")) {
        setIsAuthenticated(false);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchDocument = async (walletAddress: string): Promise<KycDocument | null> => {
    try {
      const res = await fetch(`${API_BASE}/onboarding/kyc/document/${walletAddress}`, {
        headers: {
          "x-admin-api-key": adminKey,
        },
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to fetch document");
      }

      return data.document;
    } catch (err: any) {
      console.error("Error fetching document:", err);
      return null;
    }
  };

  const handleSelectReview = async (review: PendingReview) => {
    setSelectedReview(review);
    setUserDocument(null);
    setDuplicateDocument(null);
    setReviewNotes("");
    setSecondarySalt("");

    // Fetch both documents
    const userDoc = await fetchDocument(review.wallet_address);
    setUserDocument(userDoc);

    if (review.duplicate_wallet_address) {
      const dupDoc = await fetchDocument(review.duplicate_wallet_address);
      setDuplicateDocument(dupDoc);
    }
  };

  const handleApprove = async () => {
    if (!selectedReview || !adminKey) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `${API_BASE}/onboarding/kyc/review/${selectedReview.wallet_address}/approve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-api-key": adminKey,
          },
          body: JSON.stringify({
            secondary_salt: secondarySalt || null,
            review_notes: reviewNotes || undefined,
          }),
        }
      );

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to approve review");
      }

      // Refresh pending reviews
      await fetchPendingReviews();
      setSelectedReview(null);
      setUserDocument(null);
      setDuplicateDocument(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedReview || !adminKey) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `${API_BASE}/onboarding/kyc/review/${selectedReview.wallet_address}/reject`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-api-key": adminKey,
          },
          body: JSON.stringify({
            review_notes: reviewNotes || undefined,
          }),
        }
      );

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to reject review");
      }

      // Refresh pending reviews
      await fetchPendingReviews();
      setSelectedReview(null);
      setUserDocument(null);
      setDuplicateDocument(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (adminKey && !isAuthenticated) {
      fetchPendingReviews();
    }
  }, [adminKey]);

  if (!isAuthenticated) {
    return (
      <div className={styles.container}>
        <div className={styles.authCard}>
          <h1 className={styles.title}>🔐 Admin Authentication</h1>
          <p className={styles.subtitle}>Enter your admin API key to access KYC reviews</p>
          
          <input
            type="password"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            placeholder="Admin API Key"
            className={styles.input}
            onKeyDown={(e) => e.key === "Enter" && fetchPendingReviews()}
          />

          <button onClick={fetchPendingReviews} className={styles.button} disabled={loading}>
            {loading ? "Authenticating..." : "Login"}
          </button>

          {error && <div className={styles.error}>{error}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>🔍 KYC Review Dashboard</h1>
        <button onClick={fetchPendingReviews} className={styles.refreshButton}>
          🔄 Refresh
        </button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.layout}>
        {/* Pending Reviews List */}
        <div className={styles.sidebar}>
          <h2 className={styles.sidebarTitle}>
            Pending Reviews ({pendingReviews.length})
          </h2>

          {pendingReviews.length === 0 ? (
            <div className={styles.emptyState}>
              <p>✅ No pending reviews</p>
              <p className={styles.emptySubtext}>All caught up!</p>
            </div>
          ) : (
            <div className={styles.reviewList}>
              {pendingReviews.map((review) => (
                <div
                  key={review.review_task_id}
                  className={`${styles.reviewCard} ${
                    selectedReview?.review_task_id === review.review_task_id
                      ? styles.selected
                      : ""
                  }`}
                  onClick={() => handleSelectReview(review)}
                >
                  <div className={styles.reviewHeader}>
                    <span className={styles.walletAddress}>
                      {review.wallet_address.slice(0, 6)}...{review.wallet_address.slice(-4)}
                    </span>
                    <span className={styles.badge}>Duplicate</span>
                  </div>
                  <div className={styles.reviewMeta}>
                    <span>Submitted: {new Date(review.created_at).toLocaleDateString()}</span>
                  </div>
                  {review.duplicate_wallet_address && (
                    <div className={styles.duplicateInfo}>
                      Duplicate of: {review.duplicate_wallet_address.slice(0, 6)}...
                      {review.duplicate_wallet_address.slice(-4)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Review Details */}
        <div className={styles.mainContent}>
          {!selectedReview ? (
            <div className={styles.placeholder}>
              <p>👈 Select a review from the list to get started</p>
            </div>
          ) : (
            <div className={styles.reviewDetails}>
              <h2 className={styles.detailsTitle}>Review Details</h2>

              {/* User Info */}
              <div className={styles.section}>
                <h3 className={styles.sectionTitle}>New Submission</h3>
                <div className={styles.infoGrid}>
                  <div className={styles.infoItem}>
                    <span className={styles.label}>Wallet:</span>
                    <span className={styles.value}>{selectedReview.wallet_address}</span>
                  </div>
                  <div className={styles.infoItem}>
                    <span className={styles.label}>Status:</span>
                    <span className={styles.value}>{selectedReview.kyc_status}</span>
                  </div>
                  <div className={styles.infoItem}>
                    <span className={styles.label}>Submitted:</span>
                    <span className={styles.value}>
                      {new Date(selectedReview.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>

                {userDocument && (
                  <div className={styles.documentData}>
                    <h4 className={styles.documentTitle}>KYC Data:</h4>
                    <pre className={styles.jsonData}>
                      {JSON.stringify(userDocument.data, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              {/* Duplicate Info */}
              {selectedReview.duplicate_wallet_address && (
                <div className={styles.section}>
                  <h3 className={styles.sectionTitle}>Original Submission</h3>
                  <div className={styles.infoGrid}>
                    <div className={styles.infoItem}>
                      <span className={styles.label}>Wallet:</span>
                      <span className={styles.value}>
                        {selectedReview.duplicate_wallet_address}
                      </span>
                    </div>
                  </div>

                  {duplicateDocument && (
                    <div className={styles.documentData}>
                      <h4 className={styles.documentTitle}>KYC Data:</h4>
                      <pre className={styles.jsonData}>
                        {JSON.stringify(duplicateDocument.data, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* Action Panel */}
              <div className={styles.actionPanel}>
                <h3 className={styles.sectionTitle}>Review Action</h3>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Review Notes (Optional):</label>
                  <textarea
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder="Add notes about this review decision..."
                    className={styles.textarea}
                    rows={3}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    Secondary Salt (Optional - for legitimate duplicates):
                  </label>
                  <input
                    type="text"
                    value={secondarySalt}
                    onChange={(e) => setSecondarySalt(e.target.value)}
                    placeholder="Leave empty for auto-generated salt"
                    className={styles.input}
                  />
                  <p className={styles.helpText}>
                    Use a custom salt to approve legitimate duplicate identities (e.g., family members)
                  </p>
                </div>

                <div className={styles.actionButtons}>
                  <button
                    onClick={handleApprove}
                    className={`${styles.button} ${styles.approveButton}`}
                    disabled={loading}
                  >
                    ✅ Approve
                  </button>
                  <button
                    onClick={handleReject}
                    className={`${styles.button} ${styles.rejectButton}`}
                    disabled={loading}
                  >
                    ❌ Reject
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
