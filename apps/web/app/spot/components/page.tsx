"use client";

import { useEffect, useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { useChainContext } from "@/contexts/ChainContext";
import type { SpotMarket } from "../../src/types/spotTrading";
import SpotSelector from "./SpotSelector";
import SpotTradingView from "./SpotTradingView";
import styles from "../page.module.css";

const BASE_CHAIN_ID = 84532;

export default function SpotDashboardPage() {
  const [selectedToken, setSelectedToken] = useState<SpotMarket | null>(null);
  const [selectedTimeframe, setSelectedTimeframe] = useState("1h");
  const [showTokenSelector, setShowTokenSelector] = useState(true);

  const { selectedChain, setSelectedChain } = useChainContext();
  const { chain, isConnected } = useAccount();
  const { switchChain } = useSwitchChain();

  useEffect(() => {
    if (selectedChain !== BASE_CHAIN_ID) {
      setSelectedChain(BASE_CHAIN_ID);
    }

    if (isConnected && chain?.id !== BASE_CHAIN_ID) {
      try {
        switchChain({ chainId: BASE_CHAIN_ID });
      } catch {
        // Keep the UI scoped to Base even if the wallet switch is rejected.
      }
    }
  }, [selectedChain, setSelectedChain, isConnected, chain?.id, switchChain]);

  const handleSelectToken = (token: SpotMarket) => {
    setSelectedToken(token);
    setShowTokenSelector(false);
  };

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title}>💱 Spot Trading Dashboard</h1>

      {showTokenSelector || !selectedToken ? (
        <div className={styles.selectorView}>
          <SpotSelector
            onSelectToken={handleSelectToken}
            selectedSymbol={selectedToken?.symbol}
          />
        </div>
      ) : (
        <div className={styles.tradingView}>
          <button
            onClick={() => setShowTokenSelector(true)}
            className={styles.backButton}
          >
            ← Back to Spot Markets
          </button>

          <SpotTradingView
            selectedToken={selectedToken}
            selectedSymbol={selectedToken.symbol}
            selectedTimeframe={selectedTimeframe}
            onTimeframeChange={setSelectedTimeframe}
          />
        </div>
      )}
    </div>
  );
}
