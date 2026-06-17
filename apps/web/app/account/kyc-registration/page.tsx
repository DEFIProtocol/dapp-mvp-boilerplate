"use client";

import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useUser } from "../../src/contexts/UserContext";
import styles from "../ActionPage.module.css";

export default function KycRegistrationPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { user } = useUser();
  const isVerified = user?.kyc_status === "KYC_VERIFIED";

  return (
    <div className={styles.actionPageShell}>
      <div className={styles.actionCard}>
        <h1 className={styles.actionTitle}>KYC Registration</h1>
        <p className={styles.actionInfo}>
          {isVerified
            ? "Your identity verification is complete. You are now eligible to continue through the DAO onboarding flow."
            : "Complete KYC registration to join the DAO and qualify for governance voucher issuance. This page will guide you to the next step in the onboarding flow."}
        </p>
        <button
          className={styles.actionButton}
          onClick={() => router.push(isVerified ? "/account/competency-test" : "/account/kyc-registration/start")}
        >
          {isVerified ? "Continue to competency test" : "Open KYC registration"}
        </button>
        <p className={styles.actionNote}>
          {isConnected
            ? `Connected wallet: ${address}`
            : "Please connect your wallet from the header to begin KYC registration."}
        </p>
      </div>
    </div>
  );
}
