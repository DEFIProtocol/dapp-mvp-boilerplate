"use client";

import { useState, useEffect } from "react";
import styles from "./KycReviewManager.module.css";

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

export default function KycReviewManager() {
  const [adminKey, setAdminKey] = useState("");
  const [pendingReviews, setPendingReviews] = useState<PendingReview[]>([]);
  const [selectedReview, setSelectedReview] = useState<PendingReview | null>(null);
  const [userDocument, setUserDocument] = useState<KycDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  useEffect(() => {
    if (adminKey) {
      fetchPendingReviews();
    }
  }, [adminKey]);

  const fetchPendingReviews = async () => {
    if (!adminKey) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/onboarding/kyc/reviews/pending`, {
        headers: { "x-admin-key": adminKey },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch pending reviews");
      }

      const data = await res.json();
      setPendingReviews(data.reviews || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserDocument = async (userId: string) => {
    try {
      const res = await fetch(`${API_BASE}/onboarding/kyc/document/${userId}`, {
        headers: { "x-admin-key": adminKey },
      });

      if (!res.ok) throw new Error("Failed to fetch document");

      const data = await res.json();
      setUserDocument(data.document);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleApprove = async (reviewTaskId: string) => {
    if (!confirm("Are you sure you want to approve this KYC submission?")) return;

    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/onboarding/kyc/reviews/${reviewTaskId}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": adminKey,
        },
        body: JSON.stringify({ notes: reviewNotes }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to approve");
      }

      alert("KYC approved successfully!");
      setSelectedReview(null);
      setUserDocument(null);
      setReviewNotes("");
      fetchPendingReviews();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (reviewTaskId: string) => {
    if (!confirm("Are you sure you want to reject this KYC submission?")) return;
    if (!reviewNotes.trim()) {
      alert("Please provide rejection notes");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/onboarding/kyc/reviews/${reviewTaskId}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": adminKey,
        },
        body: JSON.stringify({ notes: reviewNotes }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to reject");
      }

      alert("KYC rejected successfully!");
      setSelectedReview(null);
      setUserDocument(null);
      setReviewNotes("");
      fetchPendingReviews();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!adminKey) {
    return (
      <div className={styles.container}>
        <div className={styles.authCard}>
          <h2>🔐 KYC Review Access</h2>
          <p>Enter admin key to review KYC submissions</p>
          <input
            type="password"
            placeholder="Admin Key"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            className={styles.input}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>📋 KYC Review Queue</h2>
        <button onClick={fetchPendingReviews} className={styles.refreshButton}>
          🔄 Refresh
        </button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {loading && <div className={styles.loading}>Loading...</div>}

      {pendingReviews.length === 0 && !loading && (
        <div className={styles.emptyState}>
          <p>✅ No pending KYC reviews</p>
        </div>
      )}

      <div className={styles.reviewsList}>
        {pendingReviews.map((review) => (
          <div key={review.review_task_id} className={styles.reviewCard}>
            <div className={styles.reviewHeader}>
              <div>
                <h3>Review #{review.review_task_id.slice(0, 8)}</h3>
                <p className={styles.wallet}>{review.wallet_address}</p>
              </div>
              <span className={styles.statusBadge}>{review.status}</span>
            </div>

            <div className={styles.reviewInfo}>
              <div className={styles.infoItem}>
                <span className={styles.label}>Submitted:</span>
                <span>{new Date(review.created_at).toLocaleString()}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.label}>KYC Status:</span>
                <span className={styles.kycStatus}>{review.kyc_status}</span>
              </div>
              {review.duplicate_of_user_id && (
                <div className={styles.infoItem}>
                  <span className={styles.label}>⚠️ Duplicate of:</span>
                  <span className={styles.duplicate}>{review.duplicate_wallet_address}</span>
                </div>
              )}
            </div>

            <div className={styles.actions}>
              <button
                onClick={() => {
                  setSelectedReview(review);
                  fetchUserDocument(review.user_id);
                }}
                className={styles.viewButton}
              >
                View Details
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Review Modal */}
      {selectedReview && (
        <div className={styles.modal} onClick={() => setSelectedReview(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>KYC Review Details</h2>
              <button onClick={() => setSelectedReview(null)} className={styles.closeButton}>
                ✕
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.section}>
                <h3>User Information</h3>
                <div className={styles.infoGrid}>
                  <div>
                    <strong>Wallet:</strong>
                    <p>{selectedReview.wallet_address}</p>
                  </div>
                  <div>
                    <strong>User ID:</strong>
                    <p>{selectedReview.user_id}</p>
                  </div>
                  <div>
                    <strong>Submitted:</strong>
                    <p>{new Date(selectedReview.created_at).toLocaleString()}</p>
                  </div>
                  <div>
                    <strong>Status:</strong>
                    <p>{selectedReview.kyc_status}</p>
                  </div>
                </div>
              </div>

              {userDocument && (
                <div className={styles.section}>
                  <h3>KYC Document</h3>
                  <div className={styles.documentData}>
                    <pre>{JSON.stringify(userDocument.data, null, 2)}</pre>
                  </div>
                </div>
              )}

              <div className={styles.section}>
                <h3>Review Notes</h3>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Add notes about this review..."
                  className={styles.textarea}
                  rows={4}
                />
              </div>
            </div>

            <div className={styles.modalActions}>
              <button
                onClick={() => handleReject(selectedReview.review_task_id)}
                className={styles.rejectButton}
                disabled={loading}
              >
                ❌ Reject
              </button>
              <button
                onClick={() => handleApprove(selectedReview.review_task_id)}
                className={styles.approveButton}
                disabled={loading}
              >
                ✅ Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
