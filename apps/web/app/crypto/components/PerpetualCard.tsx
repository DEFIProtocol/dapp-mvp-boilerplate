// components/trading/PerpetualCard.tsx
"use client";
import { useState, useRef, useEffect } from 'react';
import styles from './styles/PerpetualCard.module.css';

interface PerpetualCardProps {
  symbol: string;
  price: number;
  fundingRate?: number;
  openInterest?: number;
  volume24h?: number;
  markPrice?: number;
  indexPrice?: number;
}

export default function PerpetualCard({ 
  symbol, 
  price,
  fundingRate = 0.01,
  openInterest = 125_000_000,
  volume24h = 2_500_000_000,
  markPrice,
  indexPrice
}: PerpetualCardProps) {
  const [leverage, setLeverage] = useState(1);
  const [isEditingLeverage, setIsEditingLeverage] = useState(false);
  const [leverageInput, setLeverageInput] = useState('1');
  const [positionSize, setPositionSize] = useState<number | null>(null);
  const [side, setSide] = useState<'long' | 'short'>('long');
  const [showPositionData, setShowPositionData] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);

  const mark = markPrice || price;
  const index = indexPrice || price * 0.9995;
  const premium = ((mark - index) / index * 100).toFixed(4);

  // Calculate track fill percentage for slider
  const trackFillPercentage = (leverage / 50) * 100;

  // Animate position data when positionSize changes
  useEffect(() => {
    if (positionSize && !showPositionData) {
      setShowPositionData(true);
    } else if (!positionSize && showPositionData) {
      const timer = setTimeout(() => setShowPositionData(false), 300);
      return () => clearTimeout(timer);
    }
  }, [positionSize, showPositionData]);

  // Focus input when editing
  useEffect(() => {
    if (isEditingLeverage && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditingLeverage]);

  const calculateLiquidationPrice = () => {
    const maintenanceMargin = 0.005;
    if (side === 'long') {
      return price * (1 - (1 / leverage) + maintenanceMargin);
    } else {
      return price * (1 + (1 / leverage) - maintenanceMargin);
    }
  };

  const calculatePnL = () => {
    if (!positionSize) return 0;
    const priceImpact = 0.001;
    const entryPrice = side === 'long' ? price * (1 + priceImpact) : price * (1 - priceImpact);
    const exitPrice = side === 'long' ? entryPrice * 1.01 : entryPrice * 0.99;
    const pnl = (positionSize * leverage) * (Math.abs(exitPrice - entryPrice) / entryPrice) * (side === 'long' ? 1 : -1);
    return pnl;
  };

  const handleLeverageSubmit = () => {
    const val = parseFloat(leverageInput);
    if (!isNaN(val) && val >= 1 && val <= 50) {
      setLeverage(val);
    } else {
      setLeverageInput(leverage.toString());
    }
    setIsEditingLeverage(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleLeverageSubmit();
    } else if (e.key === 'Escape') {
      setLeverageInput(leverage.toString());
      setIsEditingLeverage(false);
    }
  };

  const formatUSD = (value: number) => {
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
  };

  return (
    <div className={styles.card}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.symbolInfo}>
          <span className={styles.tokenIcon}>
            {symbol === 'BTC' && '₿'}
            {symbol === 'ETH' && 'Ξ'}
            {symbol === 'SOL' && 'S◎L'}
          </span>
          <div>
            <h3 className={styles.symbol}>{symbol}USDT Perpetual</h3>
            <span className={styles.maxLeverage}>Up to 50x</span>
          </div>
        </div>
        <div className={styles.priceInfo}>
          <div className={styles.price}>${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div className={styles.fundingRate}>
            Funding: <span className={fundingRate > 0 ? styles.positive : styles.negative}>
              {fundingRate > 0 ? '▲' : '▼'} {Math.abs(fundingRate).toFixed(4)}%
            </span>
          </div>
        </div>
      </div>

      {/* Market Stats */}
      <div className={styles.statsGrid}>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>Mark Price</span>
          <span className={styles.statValue}>${mark.toFixed(2)}</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>Index Price</span>
          <span className={styles.statValue}>${index.toFixed(2)}</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>Premium</span>
          <span className={`${styles.statValue} ${parseFloat(premium) > 0 ? styles.positive : styles.negative}`}>
            {premium}%
          </span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>24h Volume</span>
          <span className={styles.statValue}>{formatUSD(volume24h)}</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>Open Interest</span>
          <span className={styles.statValue}>{formatUSD(openInterest)}</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>Next Funding</span>
          <span className={styles.statValue}>in 4h 23m</span>
        </div>
      </div>

      {/* Trading Interface */}
      <div className={styles.tradingSection}>
        <div className={styles.sideSelector}>
          <button 
            className={`${styles.sideBtn} ${side === 'long' ? styles.longActive : ''}`}
            onClick={() => setSide('long')}
          >
            Long 📈
          </button>
          <button 
            className={`${styles.sideBtn} ${side === 'short' ? styles.shortActive : ''}`}
            onClick={() => setSide('short')}
          >
            Short 📉
          </button>
        </div>

        {/* Leverage Control - Slider + Editable Badge */}
        <div className={styles.leverageContainer}>
          <div className={styles.leverageHeader}>
            <span className={styles.leverageLabel}>Leverage</span>
            
            {/* Editable Leverage Badge */}
            <div className={styles.leverageBadge}>
              {isEditingLeverage ? (
                <div className={styles.leverageEditWrapper}>
                  <input
                    ref={inputRef}
                    type="number"
                    min="1"
                    max="50"
                    step="0.1"
                    value={leverageInput}
                    onChange={(e) => setLeverageInput(e.target.value)}
                    onBlur={handleLeverageSubmit}
                    onKeyDown={handleKeyDown}
                    className={styles.leverageInput}
                  />
                  <span className={styles.leverageX}>x</span>
                  <button 
                    className={styles.lockButton}
                    onClick={handleLeverageSubmit}
                    title="Lock leverage"
                  >
                    🔒
                  </button>
                </div>
              ) : (
                <>
                  <span className={styles.leverageValue}>{leverage}x</span>
                  <button 
                    className={styles.editButton}
                    onClick={() => setIsEditingLeverage(true)}
                    title="Edit leverage"
                  >
                    ✎
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Leverage Slider with fill effect */}
          <div 
            className={styles.sliderWrapper}
            style={{
              background: `linear-gradient(to right, #667eea, #667eea)`,
              backgroundSize: `${trackFillPercentage}% 100%`,
              backgroundRepeat: 'no-repeat',
              backgroundColor: '#f0f0f0'
            }}
          >
            <input 
              type="range" 
              min="1" 
              max="50" 
              value={leverage} 
              onChange={(e) => setLeverage(parseInt(e.target.value))}
              className={styles.leverageSlider}
            />
          </div>
          
          {/* Slider Markers */}
          <div className={styles.sliderMarkers}>
            <span>1x</span>
            <span>10x</span>
            <span>25x</span>
            <span>50x</span>
          </div>
        </div>

        {/* Position Size */}
        <div className={styles.positionSize}>
          <div className={styles.sizeHeader}>
            <span>Position Size (USD)</span>
            <span className={styles.balance}>Balance: $10,000</span>
          </div>
          <input 
            type="number" 
            value={positionSize ?? ''} 
            onChange={(e) => {
              const val = e.target.value;
              setPositionSize(val === '' ? null : parseFloat(val));
            }}
            className={styles.sizeInput}
            min="0"
            step="10"
            placeholder="0.00"
          />
        </div>

        {/* Collapsible Order Info - Only shows when positionSize has a value */}
        <div className={`${styles.orderInfo} ${positionSize ? styles.visible : styles.hidden}`}>
          <div className={styles.infoRow}>
            <span>Entry Price</span>
            <span>${price.toFixed(2)}</span>
          </div>
          <div className={styles.infoRow}>
            <span>Liquidation Price</span>
            <span className={styles.liquidation}>
              ${calculateLiquidationPrice().toFixed(2)}
            </span>
          </div>
          <div className={styles.infoRow}>
            <span>Position Value</span>
            <span>${positionSize ? (positionSize * leverage).toLocaleString() : '0'}</span>
          </div>
          <div className={styles.infoRow}>
            <span>Margin Required</span>
            <span>${positionSize ? positionSize.toLocaleString() : '0'}</span>
          </div>
          <div className={`${styles.infoRow} ${styles.pnl}`}>
            <span>Est. PnL (1% move)</span>
            <span className={calculatePnL() > 0 ? styles.positive : styles.negative}>
              {calculatePnL() > 0 ? '+' : ''}{calculatePnL().toFixed(2)} USD
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className={styles.actionButtons}>
          <button className={`${styles.actionBtn} ${styles.buyBtn}`}>
            Buy / Long {symbol}
          </button>
          <button className={`${styles.actionBtn} ${styles.sellBtn}`}>
            Sell / Short {symbol}
          </button>
        </div>
      </div>

      {/* Risk Warning - Only shows when positionSize has a value */}
      {positionSize && (
        <div className={styles.riskWarning}>
          ⚠️ Leverage trading carries high risk. Liquidation at {calculateLiquidationPrice().toFixed(2)} USD
        </div>
      )}
    </div>
  );
}