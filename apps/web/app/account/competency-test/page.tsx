"use client";

import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { useUser } from "../../src/contexts/UserContext";
import styles from "../ActionPage.module.css";

export default function CompetencyTestPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { user } = useUser();
  const isComplete = user?.competency_status === "COMPETENCY_PASSED";

  return (
    <div className={styles.actionPageShell}>
      <div className={styles.actionCard}>
        <h1 className={styles.actionTitle}>Supply Chain Competency Test</h1>
        <p className={styles.actionInfo}>
          {isComplete
            ? "You have completed the competency test. Your voting rights voucher should be available once the DAO credentials are issued."
            : "Complete the supply chain competency test to earn your voting rights voucher and participate in DAO governance."}
        </p>
        <button
          className={styles.actionButton}
          onClick={() => router.push(isComplete ? "/account" : "/account/settings")}
        >
          {isComplete ? "Return to account" : "Start competency test"}
        </button>
        <p className={styles.actionNote}>
          {isConnected
            ? `Connected wallet: ${address}`
            : "Please connect your wallet from the header to continue."}
        </p>
      </div>
    </div>
  );
}
