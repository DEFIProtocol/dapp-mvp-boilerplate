"use client";
import { useOracleRound } from "@/hooks/useOracleRound";
import { useBinanceKlines } from "@/hooks/candles/useBinanceCandles";
import PriceCard from "./components/PriceCard";
import PriceChart from "./components/chart/PriceChart";
import styles from "./page.module.css";
import { useState } from "react";

// Map timeframes to Binance intervals
const timeframeMap = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d'
};

export default function CryptoPage() {
  const [selectedSymbol, setSelectedSymbol] = useState('BTC');
  const [selectedTimeframe, setSelectedTimeframe] = useState('1h');
  
  // Oracle data for funding/liquidation
  const { data: btcData, loading: btcLoading } = useOracleRound('ethereum', 'btc', 15000);
  const { data: ethData, loading: ethLoading } = useOracleRound('ethereum', 'eth', 15000);
  const { data: solData, loading: solLoading } = useOracleRound('ethereum', 'sol', 15000);

  // Exchange data for charts - updates when timeframe changes
  const { 
    data: btcCandles, 
    loading: chartLoading,
    isTransitioning 
  } = useBinanceKlines(selectedSymbol, { 
    interval: timeframeMap[selectedTimeframe as keyof typeof timeframeMap],
    limit: 100 
  });

  const handleTimeframeChange = (timeframe: string) => {
    setSelectedTimeframe(timeframe);
  };

  if (btcLoading && ethLoading && solLoading) {
    return <div className={styles.loadingContainer}>Loading oracle data...</div>;
  }

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title}>🔮 Crypto Dashboard</h1>
      
      {/* Oracle Price Cards */}
      <div className={styles.pricesGrid}>
        <PriceCard 
          token="BTC" 
          price={btcData?.price}
          timestamp={btcData?.timestamp}
          roundId={btcData?.roundId}
          loading={btcLoading}
          onClick={() => setSelectedSymbol('BTC')}
          isSelected={selectedSymbol === 'BTC'}
        />
        <PriceCard 
          token="ETH" 
          price={ethData?.price}
          timestamp={ethData?.timestamp}
          roundId={ethData?.roundId}
          loading={ethLoading}
          onClick={() => setSelectedSymbol('ETH')}
          isSelected={selectedSymbol === 'ETH'}
        />
        <PriceCard 
          token="SOL" 
          price={solData?.price}
          timestamp={solData?.timestamp}
          roundId={solData?.roundId}
          loading={solLoading}
          onClick={() => setSelectedSymbol('SOL')}
          isSelected={selectedSymbol === 'SOL'}
        />
      </div>

      {/* Exchange Chart */}
      {btcCandles.length > 0 && (
        <div className={styles.chartSection}>
          <h2>{selectedSymbol}/USD - {selectedTimeframe} Chart</h2>
          <PriceChart 
            candles={btcCandles}
            symbol={selectedSymbol}
            exchange="Binance"
            onTimeframeChange={handleTimeframeChange}
            isLoading={chartLoading}
            isTransitioning={isTransitioning}
          />
        </div>
      )}
    </div>
  );
}