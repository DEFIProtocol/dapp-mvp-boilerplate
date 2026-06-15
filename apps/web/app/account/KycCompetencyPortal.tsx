"use client";

import { useRouter } from "next/navigation";
import { useUser } from "../src/contexts/UserContext";
import styles from "./KycCompetencyPortal.module.css";

const KYC_VERIFIED = "KYC_VERIFIED";
const COMPETENCY_PASSED = "COMPETENCY_PASSED";

export default function KycCompetencyPortal() {
  const router = useRouter();
  const { user } = useUser();

  if (!user || !user.wallet_address) {
    return null;
  }

  const isKycComplete = user.kyc_status === KYC_VERIFIED;
  const isCompetencyComplete = user.competency_status === COMPETENCY_PASSED;

  const nextAction = !isKycComplete
    ? {
        primary: "Complete KYC Registration to join the DAO!",
        secondary: "Submit identity verification to become eligible for governance vouchers.",
        button: "Open KYC Registration",
        route: "/account/kyc-registration",
      }
    : !isCompetencyComplete
    ? {
        primary: "Complete Supply Chain competency test to earn voting rights voucher",
        secondary: "Finish the competency challenge to unlock your voting rights.",
        button: "Start Competency Test",
        route: "/account/competency-test",
      }
    : null;

  if (!nextAction) {
    return null;
  }

  return (
    <>
      <div className={styles.portalCard}>
        <div className={styles.statusLabel}>
          {isKycComplete ? "KYC Verified" : "KYC Required"}
        </div>
        <h2 className={styles.portalTitle}>{nextAction.primary}</h2>
        <p className={styles.portalDescription}>{nextAction.secondary}</p>
        <button
          className={styles.portalButton}
          onClick={() => router.push(nextAction.route)}
          aria-label={nextAction.button}
        >
          {nextAction.button}
        </button>
      </div>

      <div className={styles.toastBanner}>
        <div className={styles.toastText}>
          <strong>{nextAction.primary}</strong>
          <span>{nextAction.secondary}</span>
        </div>
        <button
          className={styles.toastButton}
          onClick={() => router.push(nextAction.route)}
          aria-label={nextAction.button}
        >
          {nextAction.button}
        </button>
      </div>
    </>
  );
}
