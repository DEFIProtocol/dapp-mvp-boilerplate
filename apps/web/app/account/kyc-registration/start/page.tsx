"use client";

import { useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { useUser } from "../../../src/contexts/UserContext";
import styles from "../../ActionPage.module.css";

export default function KycStartPage() {
  const { address, isConnected } = useAccount();
  const { user } = useUser();
  const { signMessageAsync } = useSignMessage();

  const [identityJson, setIdentityJson] = useState<string>(`{
  "first_name": "",
  "last_name": "",
  "dob": ""
}`);
  const [selectedFiles, setSelectedFiles] = useState<File[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!isConnected || !address) {
      setFeedback("Please connect your wallet first.");
      return;
    }

    let identityData: any;
    try {
      identityData = JSON.parse(identityJson);
    } catch (err) {
      setFeedback("Invalid JSON for identity data.");
      return;
    }

    try {
      setLoading(true);
      setFeedback(null);

      // attach files as base64 if any
      if (selectedFiles && selectedFiles.length > 0) {
        const maxBytes = 5 * 1024 * 1024; // 5MB per file
        const filePromises = Array.from(selectedFiles).map((f) => {
          if (f.size > maxBytes) throw new Error(`File ${f.name} exceeds 5MB limit`);
          return new Promise<any>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              // result is like data:<type>;base64,xxxxx
              const base64 = result.split(",")[1] || "";
              resolve({ filename: f.name, type: f.type, content_base64: base64 });
            };
            reader.onerror = (e) => reject(e);
            reader.readAsDataURL(f);
          });
        });

        const filesArr = await Promise.all(filePromises);
        identityData.files = filesArr;
      }

      const messagePayload = JSON.stringify({
        action: "KYC_REGISTRATION",
        wallet_address: address?.toLowerCase(),
        timestamp: Math.floor(Date.now() / 1000),
      });

      const signature = await signMessageAsync({ message: messagePayload });

      const res = await fetch("/api/onboarding/kyc/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet_address: address,
          identity_data: identityData,
          message: messagePayload,
          signature,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Registration failed");
      setFeedback("KYC registration submitted. Status: " + (json.status || "submitted"));
    } catch (err: any) {
      setFeedback(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.actionPageShell}>
      <div className={styles.actionCard}>
        <h1 className={styles.actionTitle}>Start KYC Registration</h1>
        <p className={styles.actionInfo}>
          Paste a minimal JSON identity object or edit the example, then click Submit to sign and upload your data.
        </p>

        <textarea
          value={identityJson}
          onChange={(e) => setIdentityJson(e.target.value)}
          className={styles.textarea}
          rows={8}
        />

        <div style={{ marginTop: 12 }}>
          <label style={{ display: "block", marginBottom: 6 }}>Upload files (optional, max 5MB each)</label>
          <input
            type="file"
            multiple
            onChange={(e) => setSelectedFiles(e.target.files ? Array.from(e.target.files) : null)}
          />
          {selectedFiles && selectedFiles.length > 0 ? (
            <ul style={{ marginTop: 8 }}>
              {selectedFiles.map((f) => (
                <li key={f.name}>{f.name} ({Math.round(f.size / 1024)} KB)</li>
              ))}
            </ul>
          ) : null}
        </div>

        <button className={styles.actionButton} onClick={handleSubmit} disabled={loading}>
          {loading ? "Submitting..." : "Submit KYC"}
        </button>

        {feedback ? <p className={styles.actionNote}>{feedback}</p> : null}

        <p className={styles.actionNote}>
          {isConnected ? `Connected wallet: ${address}` : "Please connect your wallet from the header to begin."}
        </p>
      </div>
    </div>
  );
}
