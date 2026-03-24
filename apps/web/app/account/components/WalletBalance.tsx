// app/account/components/WalletBalance.tsx
"use client";

import styles from "./styles/WalletBalance.module.css";

interface WalletBalanceProps {
  address: string;
  nativeBalance: string | null;
  loading: boolean;
  chainLabel: string;
}

export function WalletBalance({ 
  address, 
  nativeBalance, 
  loading, 
  chainLabel 
}: WalletBalanceProps) {
  return (
    <div className={styles.walletBalanceCard}>
      <h2 className={styles.sectionTitle}>Wallet Address</h2>
      <p className={styles.addressValue}>{address}</p>

      <div className={styles.balanceSection}>
        <h2 className={styles.balanceLabel}>Native Balance on {chainLabel}</h2>
        {loading ? (
          <p className={styles.balanceLoading}>Loading...</p>
        ) : (
          <p className={styles.balanceValue}>
            {nativeBalance ? `${nativeBalance} ETH` : "—"}
          </p>
        )}
      </div>
    </div>
  );
}