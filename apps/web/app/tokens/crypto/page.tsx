// app/crypto/page.tsx
"use client";
import { useState } from "react";
import { usePerps } from "@/contexts/PerpsContext";
import TokenSelector from "./components/TokenSelector";
import TradingView from "./components/TradingView";
import styles from "./page.module.css";

export default function CryptoPage() {
  const [selectedToken, setSelectedToken] = useState<any>(null);
  const [selectedTimeframe, setSelectedTimeframe] = useState('1h');
  const [showTokenSelector, setShowTokenSelector] = useState(true);

  const handleSelectToken = (token: any) => {
    setSelectedToken(token);
    setShowTokenSelector(false); // Hide table after selection
  };

  const handleBackToMarkets = () => {
    setShowTokenSelector(true);
  };

  const handleTimeframeChange = (timeframe: string) => {
    setSelectedTimeframe(timeframe);
  };

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title}>🔮 Crypto Trading Dashboard</h1>
      
      {showTokenSelector ? (
        /* Token Selector View */
        <div className={styles.selectorView}>
          <TokenSelector 
            onSelectToken={handleSelectToken}
            selectedSymbol={selectedToken?.symbol}
          />
        </div>
      ) : (
        /* Trading View */
        <div className={styles.tradingView}>
          <button 
            onClick={handleBackToMarkets}
            className={styles.backButton}
          >
            ← Back to Markets
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