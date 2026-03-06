// app/crypto/components/MarketHeader.tsx
"use client";
import { useState, useEffect } from 'react';
import styles from './styles/MarketHeader.module.css';

interface MarketHeaderProps {
  symbol: string;
  name: string;
  tokenIcon?: string;
  maxLeverage?: number;
  priceData?: {
    price: number;
    confidence: number;
    confidence_percent: number;
    timestamp: number;
  };
  fundingData?: {
    funding_rate: number;
    funding_rate_percent: number;
    spot_price: number;
    ema_price: number;
  };
}

export default function MarketHeader({ 
  symbol,
  name,
  tokenIcon,
  maxLeverage = 50,
  priceData,
  fundingData
}: MarketHeaderProps) {
  
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const formatUSD = (value: number) => {
    if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
  };

  const getTokenIcon = () => {
    if (tokenIcon) {
      return <img src={tokenIcon} alt={symbol} className={styles.tokenIconImg} />;
    }
    switch(symbol) {
      case 'BTC': return '₿';
      case 'ETH': return 'Ξ';
      case 'SOL': return 'S◎L';
      default: return symbol.slice(0, 2);
    }
  };

  // Calculate mark price (using spot price as mark for now)
  const markPrice = priceData?.price || 0;
  const indexPrice = markPrice * 0.9995;
  const premium = markPrice ? ((markPrice - indexPrice) / indexPrice * 100).toFixed(4) : '0.0000';

  return (
    <div className={`${styles.header} ${isScrolled ? styles.scrolled : ''}`}>
      <div className={styles.headerContent}>
        {/* Left section - Token Info */}
        <div className={styles.tokenSection}>
          <div className={styles.tokenIconWrapper}>
             <span className={styles.tokenIcon}>
            {symbol === 'BTC' && '₿'}
            {symbol === 'ETH' && 'Ξ'}
            {symbol === 'SOL' && 'S◎L'}
          </span>
          </div>
          <div className={styles.tokenInfo}>
            <div className={styles.tokenNameRow}>
              <span className={styles.tokenName}>{name}</span>
              <span className={styles.tokenSymbol}>{symbol}USDT</span>
              <span className={styles.maxLeverage}>{maxLeverage}x</span>
            </div>
            {priceData && (
              <div className={styles.confidence}>
                ±${priceData.confidence.toFixed(2)} ({priceData.confidence_percent.toFixed(2)}%)
              </div>
            )}
          </div>
        </div>

        {/* Price Section */}
        <div className={styles.priceSection}>
          <div className={styles.priceContainer}>
            <span className={styles.priceLabel}>Price</span>
            <div className={styles.priceRow}>
              <span className={styles.price}>
                ${priceData?.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
              </span>
              {priceData && (
                <span className={`${styles.priceChange} ${styles.neutral}`}>
                  ±{priceData.confidence_percent.toFixed(2)}%
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Market Stats Grid */}
        <div className={styles.statsGrid}>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Mark</span>
            <span className={styles.statValue}>${markPrice.toFixed(2)}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Index</span>
            <span className={styles.statValue}>${indexPrice.toFixed(2)}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Premium</span>
            <span className={`${styles.statValue} ${parseFloat(premium) > 0 ? styles.positive : styles.negative}`}>
              {premium}%
            </span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Volume</span>
            <span className={styles.statValue}>{formatUSD(125_000_000)}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>OI</span>
            <span className={styles.statValue}>{formatUSD(2_500_000_000)}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Funding</span>
            <span className={`${styles.statValue} ${fundingData?.funding_rate && fundingData.funding_rate > 0 ? styles.positive : styles.negative}`}>
              {fundingData ? (
                <>
                  {fundingData.funding_rate > 0 ? '▲' : '▼'} {Math.abs(fundingData.funding_rate_percent).toFixed(4)}%
                </>
              ) : '0.0000%'}
            </span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Next</span>
            <span className={styles.statValue}>4h 23m</span>
          </div>
        </div>
      </div>
    </div>
  );
}