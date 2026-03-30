// app/account/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useRouter } from "next/navigation";
import { fetchHoldings } from "../src/lib/api/holdings";
import { useChainContext } from "../src/contexts/ChainContext";
import { useUser } from "../src/contexts/UserContext";
import { useTokens } from "../src/contexts/TokenContext";
import { WalletBalance } from "./components/WalletBalance";
import { Holdings } from "./components/Holdings";
import { Watchlist } from "./components/Watchlist";
import styles from "./page.module.css";

export default function AccountPage() {
  const { address } = useAccount();
  const router = useRouter();
  const { selectedChain, getChainLabel } = useChainContext();
  const { watchlist } = useUser();
  const { tokens } = useTokens();
  
  const [loading, setLoading] = useState(false);
  const [nativeBalance, setNativeBalance] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;

    const controller = new AbortController();
    let isMounted = true;

    const loadHoldings = async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await fetchHoldings(address, selectedChain, controller.signal);
        if (!isMounted) return;
        setNativeBalance(data.nativeBalance?.balance || null);
        setHoldings(data.holdings || []);
      } catch (err: any) {
        if (!isMounted || err?.name === "AbortError") return;
        setError(err.message || "Failed to load holdings");
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadHoldings();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [address, selectedChain]);

  if (!address) {
    return (
      <div className={styles.connectContainer}>
        <h1 className={styles.connectTitle}>Connect Your Wallet</h1>
        <p className={styles.connectDescription}>
          Please connect your wallet to view your account details and token holdings.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.pageContainer}>
      {/* Header */}
      <div className={styles.headerCard}>
        <div className={styles.headerLeft}>
          <h1>Account</h1>
          <p>Connected to {getChainLabel(selectedChain)}</p>
        </div>
        <button
          onClick={() => router.push("/account/settings")}
          className={styles.settingsButton}
          aria-label="Account settings"
        >
          <span className={styles.settingsGlyph} aria-hidden="true">⚙</span>
        </button>
      </div>

      {/* Wallet Balance */}
      <WalletBalance
        address={address}
        nativeBalance={nativeBalance}
        loading={loading}
        chainLabel={getChainLabel(selectedChain)}
      />

      {/* Holdings */}
      <Holdings
        holdings={holdings}
        tokens={tokens}
        loading={loading}
        error={error}
        selectedChain={selectedChain}
      />

      {/* Watchlist */}
      <Watchlist
        watchlist={watchlist}
        tokens={tokens}
        selectedChain={selectedChain}
      />
    </div>
  );
}