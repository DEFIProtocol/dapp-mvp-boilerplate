"use client";

import { useEffect, useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { useChainContext } from "@/contexts/ChainContext";
import type { OptionsUnderlying } from "@/types/optionsTrading";
import OptionsSelector from "./OptionsSelector";
import OptionsTradingView from "./OptionsTradingView";
import styles from "../page.module.css";

const BASE_CHAIN_ID = 8453;

export default function OptionsDashboardPage() {
  const [selectedToken, setSelectedToken] = useState<OptionsUnderlying | null>(null);
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

  const handleSelectToken = (token: OptionsUnderlying) => {
    setSelectedToken(token);
    setShowTokenSelector(false);
  };

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title}>🧠 Options Trading Dashboard</h1>

      {showTokenSelector || !selectedToken ? (
        <div className={styles.selectorView}>
          <OptionsSelector
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
            ← Back to Options Markets
          </button>

          <OptionsTradingView
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
