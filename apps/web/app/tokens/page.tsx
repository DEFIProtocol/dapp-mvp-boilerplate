// tokens/page.tsx
"use client";

import TokensTable from "./components/TokensTable";
import styles from "./TokensPage.module.css";
import { useChainContext } from "@/contexts/ChainContext";

export default function TokensPage() {
  const { selectedChain, getChainLabel } = useChainContext();

  return (
    <div className={styles.page}>
      <div className={styles.gradientBg} />
      <main className={styles.main}>
        <header className={styles.header}>
          <div className={styles.headerContent}>
            <div className={styles.titleSection}>
              <div className={styles.titleGlow} />
              <h1 className={styles.title}>Token Explorer</h1>
              <div className={styles.titleAccent} />
            </div>
            <p className={styles.subtitle}>
              Real-time market data for {getChainLabel(selectedChain)} ({selectedChain}) ecosystem
            </p>
          </div>
        </header>
        <TokensTable />
      </main>
    </div>
  );
}