// app/crypto/components/TradingView.tsx
"use client";
import { useKlinesStore } from "@/hooks/candles/useKlineStore";
import { usePythPriceWithConfidence } from "@/hooks/pyth/usePythPriceWithConfidence";
import { usePythFundingRate } from "@/hooks/pyth/usePythFundingRate";
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

// Map symbols to their Pyth feed IDs
const PYTH_FEED_IDS: Record<string, string> = {
  'BTC': '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  'ETH': '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  'SOL': '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  'AVAX': '0x93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7',
  'BNB': '0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f',
  'LINK': '0x8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221',
};

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
  
  const feedId = PYTH_FEED_IDS[selectedSymbol];

  // Fetch Pyth data once at the parent level (400ms updates)
  const { data: priceData } = usePythPriceWithConfidence(feedId, 400);
  const { data: fundingData } = usePythFundingRate(feedId, 400);
  
  // Chart data
 const { 
  data: candles, 
  loading: chartLoading, 
  exchange
} = useKlinesStore(selectedSymbol, {
  interval: timeframeMap[selectedTimeframe as keyof typeof timeframeMap],
  limit: 1000
});
  return (
    <>
      <MarketHeader
  symbol={selectedSymbol}
  name={selectedToken.name}
  tokenIcon={selectedToken.icon_url}
  priceData={priceData ?? undefined}
  fundingData={fundingData ?? undefined}
/>
      
      <div className={styles.tradingView}>
        <div className={styles.topRow}>
          <div className={styles.chartColumn}>
            <PriceChart 
              candles={candles}
              symbol={selectedSymbol}
              exchange={exchange || "Loading"}
              onTimeframeChange={onTimeframeChange}
              selectedTimeframe={selectedTimeframe}
              isLoading={chartLoading}
            />
          </div>
          
          <div className={styles.perpetualColumn}>
            <PerpetualCard 
              symbol={selectedSymbol}
              price={priceData?.price || 0}
              fundingRate={fundingData?.funding_rate || 0.0085}
            />
          </div>
        </div>
      </div>
    </>
  );
}