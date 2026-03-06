// components/trading/PerpetualCard.tsx
"use client";
import { useState, useRef, useEffect } from 'react';
import styles from './styles/PerpetualCard.module.css';

interface PerpetualCardProps {
  symbol: string;
  price: number;
  fundingRate?: number;
}

export default function PerpetualCard({ 
  symbol, 
  price,
  fundingRate = 0.001, // 0.1% = 0.001
}: PerpetualCardProps) {
  const [leverage, setLeverage] = useState(1);
  const [isEditingLeverage, setIsEditingLeverage] = useState(false);
  const [leverageInput, setLeverageInput] = useState('1');
  const [positionSize, setPositionSize] = useState<number | null>(null);
  const [orderType, setOrderType] = useState<'market' | 'limit'>('limit');
  const [limitPrice, setLimitPrice] = useState<number | null>(null);
  const [showPositionData, setShowPositionData] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);

  // Fix funding rate display - convert to percentage and ensure proper decimal
  const fundingRatePercent = fundingRate * 100; // Convert to percentage

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
    const entry = orderType === 'limit' && limitPrice ? limitPrice : price;
    
    return entry * (1 - (1 / leverage) + maintenanceMargin);
  };

  const calculatePnL = () => {
    if (!positionSize) return 0;
    const entry = orderType === 'limit' && limitPrice ? limitPrice : price;
    const priceImpact = 0.001;
    const entryWithImpact = entry * (1 + priceImpact);
    const exitPrice = entryWithImpact * 1.01;
    const pnl = (positionSize * leverage) * (Math.abs(exitPrice - entryWithImpact) / entryWithImpact);
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

  return (
    <div className={styles.card}>
      {/* Header - Only funding rate remains */}
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
        <div className={styles.fundingBadge}>
          <span className={fundingRate >= 0 ? styles.positive : styles.negative}>
            {fundingRate >= 0 ? '▲' : '▼'} {Math.abs(fundingRatePercent).toFixed(4)}%
          </span>
        </div>
      </div>

      <div className={styles.leverageContainer}>
        <div className={styles.leverageHeader}>
          <span className={styles.leverageLabel}>Leverage</span>
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
        <div className={styles.sliderMarkers}>
          <span>1x</span>
          <span>10x</span>
          <span>25x</span>
          <span>50x</span>
        </div>
      </div>

      {/* Trading Interface */}
      <div className={styles.tradingSection}>
        <div className={styles.orderTypeSelector}>
          <button 
            className={`${styles.orderTypeBtn} ${orderType === 'market' ? styles.active : ''}`}
            onClick={() => setOrderType('market')}
          >
            Market
          </button>
          <button 
            className={`${styles.orderTypeBtn} ${orderType === 'limit' ? styles.active : ''}`}
            onClick={() => setOrderType('limit')}
          >
            Limit
          </button>
        </div>

        {orderType === 'limit' && (
          <div className={styles.limitPrice}>
            <div className={styles.limitHeader}>
              <span>Limit Price (USD)</span>
              <span className={styles.marketPrice}>Market: ${price.toFixed(2)}</span>
            </div>
            <input 
              type="number" 
              value={limitPrice ?? ''} 
              onChange={(e) => {
                const val = e.target.value;
                setLimitPrice(val === '' ? null : parseFloat(val));
              }}
              className={styles.limitInput}
              min="0"
              step="0.01"
              placeholder={price.toFixed(2)}
            />
          </div>
        )}

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
            <span>${(orderType === 'limit' && limitPrice ? limitPrice : price).toFixed(2)}</span>
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
            {orderType === 'limit' ? 'Place Limit Order' : 'Buy / Long'} {symbol}
          </button>
          <button className={`${styles.actionBtn} ${styles.sellBtn}`}>
            {orderType === 'limit' ? 'Place Limit Order' : 'Sell / Short'} {symbol}
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