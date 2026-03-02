// app/crypto/components/TradingView.tsx
"use client";
import { useOracleRound } from "@/hooks/useOracleRound";
import { useBinanceKlines } from "@/hooks/candles/useBinanceCandles";
import PriceChart from "./chart/PriceChart";
import PerpetualCard from "./PerpetualCard";
import MarketHeader from "./MarketHeader";
import styles from "./styles/TradingView.module.css";

interface TradingViewProps {
  selectedToken: {
    symbol: string;
    name: string;
    token_address?: string;
    icon_url?: string;
  };
  selectedSymbol: string;
  selectedTimeframe: string;
  onTimeframeChange: (timeframe: string) => void;
}

const timeframeMap = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d'
};

export default function TradingView({ 
  selectedToken,
  selectedSymbol,
  selectedTimeframe,
  onTimeframeChange
}: TradingViewProps) {
  
  const { data: oracleData } = useOracleRound('ethereum', selectedSymbol.toLowerCase(), 15000);
  const { data: candles, loading: chartLoading, isTransitioning } = useBinanceKlines(selectedSymbol, { 
    interval: timeframeMap[selectedTimeframe as keyof typeof timeframeMap],
    limit: 100 
  });

  return (
    <>
      {/* MarketHeader OUTSIDE the main container - at the very top */}
      <MarketHeader 
        symbol={selectedSymbol}
        name={selectedToken.name}
        price={oracleData?.price || 0}
        tokenIcon={selectedToken.icon_url}
        fundingRate={0.0085}
        openInterest={125_000_000}
        volume24h={2_500_000_000}
      />
      
      {/* Main content container */}
      <div className={styles.tradingView}>
        {/* Hide old token header */}
        <div className={styles.tokenHeader} style={{ display: 'none' }}></div>

        {/* Top Row - Chart + Perpetual */}
        <div className={styles.topRow}>
          <div className={styles.chartColumn}>
            <PriceChart 
              candles={candles}
              symbol={selectedSymbol}
              exchange="Binance"
              onTimeframeChange={onTimeframeChange}
              isLoading={chartLoading}
              isTransitioning={isTransitioning}
            />
          </div>
          
          <div className={styles.perpetualColumn}>
            <PerpetualCard 
              symbol={selectedSymbol}
              price={oracleData?.price || 0}
              fundingRate={0.0085}
              openInterest={125_000_000}
              volume24h={2_500_000_000}
            />
          </div>
        </div>
      </div>
    </>
  );
}