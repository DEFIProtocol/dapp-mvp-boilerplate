// components/oracle/PriceChart.tsx
"use client";
import { useState, useEffect, useRef } from 'react';
import ChartTimeframe from './ChartTimeframe';
import styles from './PriceChart.module.css';

interface PriceChartProps {
  candles: Array<{
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }>;
  symbol: string;
  exchange?: string;
  onTimeframeChange?: (timeframe: string) => void;
  isLoading?: boolean;
  isTransitioning?: boolean;
}

export default function PriceChart({ 
  candles, 
  symbol,
  exchange = 'Binance',
  onTimeframeChange,
  isLoading = false,
  isTransitioning = false
}: PriceChartProps) {
  const [selectedTimeframe, setSelectedTimeframe] = useState('1h');
  const [prevCandles, setPrevCandles] = useState(candles);
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartDimensions, setChartDimensions] = useState({ width: 0, height: 400 });

  // Store previous candles for transition
  useEffect(() => {
    if (candles.length > 0) {
      setPrevCandles(candles);
    }
  }, [candles]);

  // Handle timeframe change
  const handleTimeframeChange = (timeframe: string) => {
    setSelectedTimeframe(timeframe);
    if (onTimeframeChange) {
      onTimeframeChange(timeframe);
    }
  };

  // Update chart dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (chartRef.current) {
        setChartDimensions({
          width: chartRef.current.clientWidth,
          height: 400
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  if (isLoading && !candles.length) {
    return (
      <div className={styles.chartContainer} style={{ height: 400 }}>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <div>Loading chart data...</div>
        </div>
      </div>
    );
  }

  if (!candles || candles.length === 0) {
    return (
      <div className={styles.chartContainer} style={{ height: 400 }}>
        <div className={styles.noData}>
          <span>📊</span>
          <div>No historical data available</div>
        </div>
      </div>
    );
  }

  // Calculate chart dimensions
  const minPrice = Math.min(...candles.map(c => c.low)) * 0.998;
  const maxPrice = Math.max(...candles.map(c => c.high)) * 1.002;
  const priceRange = maxPrice - minPrice;

  // Calculate 24h change
  const firstCandle = candles[0];
  const lastCandle = candles[candles.length - 1];
  const changePercent = ((lastCandle.close - firstCandle.open) / firstCandle.open * 100).toFixed(2);
  const isPositive = lastCandle.close > firstCandle.open;

  // Determine visible candles
  const maxCandles = Math.floor((chartDimensions.width - 80) / 10);
  const visibleCandles = candles.slice(-Math.min(candles.length, maxCandles));

  // Use previous candles for transition effect
  const displayCandles = isTransitioning ? prevCandles : candles;
  const visibleDisplayCandles = displayCandles.slice(-Math.min(displayCandles.length, maxCandles));

  return (
    <div className={styles.chartContainer} ref={chartRef}>
      <div className={styles.chartHeader}>
        <div className={styles.chartTitle}>
          <span className={styles.tokenIcon}>
            {symbol === 'BTC' && '₿'}
            {symbol === 'ETH' && 'Ξ'}
            {symbol === 'SOL' && 'S◎L'}
          </span>
          <div>
            <h3>{symbol}/USD - {exchange}</h3>
            <span className={styles.timeframeLabel}>{selectedTimeframe} chart</span>
          </div>
        </div>
        
        <div className={styles.chartControls}>
          <ChartTimeframe 
            selected={selectedTimeframe}
            onSelect={handleTimeframeChange}
          />
          
          <div className={`${styles.chartStats} ${isTransitioning ? styles.pulse : ''}`}>
            <span className={styles.statLabel}>24h Change:</span>
            <span className={isPositive ? styles.positive : styles.negative}>
              {isPositive ? '▲' : '▼'} {Math.abs(parseFloat(changePercent))}%
            </span>
          </div>
        </div>
      </div>

      <div className={styles.chart} style={{ height: 350 }}>
        {/* Price scale */}
        <div className={styles.priceScale}>
          <span>${maxPrice.toFixed(2)}</span>
          <span>${((maxPrice + minPrice) / 2).toFixed(2)}</span>
          <span>${minPrice.toFixed(2)}</span>
        </div>

        {/* Candles with transition effect */}
        <div className={`${styles.candles} ${isTransitioning ? styles.transitioning : ''}`}>
          {visibleDisplayCandles.map((candle, i) => {
            const isUp = candle.close >= candle.open;
            const candleHeight = ((candle.high - candle.low) / priceRange) * 100;
            const bodyHeight = (Math.abs(candle.close - candle.open) / priceRange) * 100;
            const bodyTop = ((maxPrice - Math.max(candle.open, candle.close)) / priceRange) * 100;
            const wickTop = ((maxPrice - candle.high) / priceRange) * 100;
            const candleWidth = Math.max(4, Math.min(8, Math.floor(500 / visibleCandles.length)));

            return (
              <div 
                key={i} 
                className={`${styles.candleWrapper} ${isTransitioning ? styles.fadeIn : ''}`}
                style={{ 
                  flex: `0 0 ${candleWidth}px`,
                  maxWidth: `${candleWidth}px`,
                  animationDelay: `${i * 10}ms`
                }}
                title={`
                  Time: ${new Date(candle.timestamp).toLocaleString()}
                  Open: $${candle.open.toFixed(2)}
                  High: $${candle.high.toFixed(2)}
                  Low: $${candle.low.toFixed(2)}
                  Close: $${candle.close.toFixed(2)}
                  Volume: ${candle.volume?.toFixed(2) || 'N/A'}
                `}
              >
                {/* Wick */}
                <div 
                  className={styles.wick}
                  style={{
                    top: `${wickTop}%`,
                    height: `${candleHeight}%`,
                    backgroundColor: isUp ? '#10b981' : '#ef4444',
                    width: '2px'
                  }}
                />
                {/* Body */}
                <div 
                  className={`${styles.body} ${isUp ? styles.up : styles.down}`}
                  style={{
                    top: `${bodyTop}%`,
                    height: `${bodyHeight}%`,
                    backgroundColor: isUp ? '#10b981' : '#ef4444',
                    width: `${Math.max(2, candleWidth - 2)}px`,
                    left: '50%',
                    transform: 'translateX(-50%)'
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Time scale */}
      <div className={styles.timeScale}>
        {visibleCandles.map((candle, i) => {
          if (i % Math.floor(visibleCandles.length / 6) === 0) {
            const date = new Date(candle.timestamp);
            const timeStr = selectedTimeframe === '1d' 
              ? date.toLocaleDateString([], { month: 'short', day: 'numeric' })
              : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            return (
              <span key={i} className={styles.timeLabel}>
                {timeStr}
              </span>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}