"use client";
import { useOracleRound } from "@/hooks/useOracleRound";
import { useBinanceKlines } from "@/hooks/candles/useBinanceCandles";
import PriceCard from "./components/PriceCard";
import PriceChart from "./components/chart/PriceChart";
import PerpetualCard from "./components/PerpetualCard";
import styles from "./page.module.css";
import { useState } from "react";

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
  
  // Oracle data
  const { data: btcData } = useOracleRound('ethereum', 'btc', 15000);
  const { data: ethData } = useOracleRound('ethereum', 'eth', 15000);
  const { data: solData } = useOracleRound('ethereum', 'sol', 15000);

  // Chart data
  const { 
    data: btcCandles, 
    loading: chartLoading,
    isTransitioning 
  } = useBinanceKlines(selectedSymbol, { 
    interval: timeframeMap[selectedTimeframe as keyof typeof timeframeMap],
    limit: 100 
  });

  // Get current price for selected symbol
  const getCurrentPrice = () => {
    switch(selectedSymbol) {
      case 'BTC': return btcData?.price || 65432;
      case 'ETH': return ethData?.price || 3521;
      case 'SOL': return solData?.price || 145;
      default: return 0;
    }
  };

  const handleTimeframeChange = (timeframe: string) => {
    setSelectedTimeframe(timeframe);
  };

  return (
    <div className={styles.dashboard}>
      <h1 className={styles.title}>🔮 Crypto Trading Dashboard</h1>
      
      {/* Top Row - Chart (67%) + Perpetual Card (33%) */}
      <div className={styles.topRow}>
        <div className={styles.chartColumn}>
          <PriceChart 
            candles={btcCandles}
            symbol={selectedSymbol}
            exchange="Binance"
            onTimeframeChange={handleTimeframeChange}
            isLoading={chartLoading}
            isTransitioning={isTransitioning}
          />
        </div>
        
        <div className={styles.perpetualColumn}>
          <PerpetualCard 
            symbol={selectedSymbol}
            price={getCurrentPrice()}
            fundingRate={0.0085}
            openInterest={125_000_000}
            volume24h={2_500_000_000}
          />
        </div>
      </div>

      {/* Bottom Row - Price Cards */}
      <div className={styles.bottomRow}>
        <h2 className={styles.sectionTitle}>Market Prices</h2>
        <div className={styles.pricesGrid}>
          <PriceCard 
            token="BTC" 
            price={btcData?.price}
            timestamp={btcData?.timestamp}
            roundId={btcData?.roundId}
            onClick={() => setSelectedSymbol('BTC')}
            isSelected={selectedSymbol === 'BTC'}
          />
          <PriceCard 
            token="ETH" 
            price={ethData?.price}
            timestamp={ethData?.timestamp}
            roundId={ethData?.roundId}
            onClick={() => setSelectedSymbol('ETH')}
            isSelected={selectedSymbol === 'ETH'}
          />
          <PriceCard 
            token="SOL" 
            price={solData?.price}
            timestamp={solData?.timestamp}
            roundId={solData?.roundId}
            onClick={() => setSelectedSymbol('SOL')}
            isSelected={selectedSymbol === 'SOL'}
          />
        </div>
      </div>
    </div>
  );
}