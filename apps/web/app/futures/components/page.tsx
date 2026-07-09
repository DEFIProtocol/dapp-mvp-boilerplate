"use client";

import { useEffect, useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { useChainContext } from "@/contexts/ChainContext";
import TokenSelector from "./TokenSelector";
import TradingView from "./TradingView";
import styles from "./page.module.css";

const BASE_CHAIN_ID = 84532;

export default function FuturesPage() {
  const [selectedToken, setSelectedToken] = useState<any>(null);
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
        // Keep UI on Base context even if wallet switch is rejected.
      }
    }
  }, [selectedChain, setSelectedChain, isConnected, chain?.id, switchChain]);

  const handleSelectToken = (token: any) => {
    setSelectedToken(token);
    setShowTokenSelector(false);
  };

  const handleBackToMarkets = () => {
    setShowTokenSelector(true);
  };

  const handleTimeframeChange = (timeframe: string) => {
    setSelectedTimeframe(timeframe);
  };

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title}>🔮 Futures Trading Dashboard</h1>

      {showTokenSelector ? (
        <div className={styles.selectorView}>
          <TokenSelector
            onSelectToken={handleSelectToken}
            selectedSymbol={selectedToken?.symbol}
          />
        </div>
      ) : (
        <div className={styles.tradingView}>
          <button
            onClick={handleBackToMarkets}
            className={styles.backButton}
          >
            ← Back to Futures Markets
          </button>

          <TradingView
            selectedToken={selectedToken}
            selectedSymbol={selectedToken.symbol}
            selectedTimeframe={selectedTimeframe}
            onTimeframeChange={handleTimeframeChange}
          />
        </div>
      )}
    </div>
  );
}
