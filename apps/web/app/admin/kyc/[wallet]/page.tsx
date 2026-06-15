"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function KycViewer({ params }: { params: { wallet: string } }) {
  const wallet = params.wallet;
  const [doc, setDoc] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/kyc/document/${encodeURIComponent(wallet)}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Failed to load document');
        setDoc(json.document);
      } catch (err: any) {
        setFeedback(err?.message || String(err));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [wallet]);

  const doApprove = async () => {
    const reviewNotes = window.prompt('Review notes (optional)') || undefined;
    const secondarySalt = window.prompt('Secondary salt (optional)') || undefined;
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/kyc/review/${encodeURIComponent(wallet)}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review_notes: reviewNotes, secondary_salt: secondarySalt }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Approve failed');
      setFeedback('Approved');
      router.push('/admin');
    } catch (err: any) {
      setFeedback(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const doReject = async () => {
    const reviewNotes = window.prompt('Reject notes (optional)') || undefined;
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/kyc/review/${encodeURIComponent(wallet)}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review_notes: reviewNotes }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Reject failed');
      setFeedback('Rejected');
      router.push('/admin');
    } catch (err: any) {
      setFeedback(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>KYC Viewer — {wallet}</h2>
      {loading ? <p>Loading...</p> : null}
      {feedback ? <p>{feedback}</p> : null}
      {doc ? (
        <div>
          <h3>Document (created: {doc.created_at})</h3>
          <pre style={{ whiteSpace: 'pre-wrap', background: '#f7f7f7', padding: 12 }}>{JSON.stringify(doc.data, null, 2)}</pre>
          <div style={{ marginTop: 12 }}>
            <button onClick={doApprove} style={{ marginRight: 8 }}>Approve</button>
            <button onClick={doReject}>Reject</button>
          </div>
        </div>
      ) : (
        <p>No document loaded.</p>
      )}
    </div>
  );
}
