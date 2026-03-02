// app/crypto/components/MarketHeader.tsx
"use client";
import { useState, useEffect } from 'react';
import styles from './styles/MarketHeader.module.css';

interface MarketHeaderProps {
  symbol: string;
  name: string;
  price: number;
  priceChange?: number;
  fundingRate?: number;
  markPrice?: number;
  indexPrice?: number;
  openInterest?: number;
  volume24h?: number;
  tokenIcon?: string;
  maxLeverage?: number;
  nextFunding?: string;
}

export default function MarketHeader({ 
  symbol,
  name,
  price,
  priceChange = 0.5,
  fundingRate = 0.0085,
  markPrice,
  indexPrice,
  openInterest = 125_000_000,
  volume24h = 2_500_000_000,
  tokenIcon,
  maxLeverage = 50,
  nextFunding = '4h 23m'
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

  const isPriceUp = priceChange >= 0;
  const mark = markPrice || price;
  const index = indexPrice || price * 0.9995;
  const premium = ((mark - index) / index * 100).toFixed(4);

  return (
    <div className={`${styles.header} ${isScrolled ? styles.scrolled : ''}`}>
      <div className={styles.headerContent}>
        {/* Left section - Token Info */}
        <div className={styles.tokenSection}>
          <div className={styles.tokenIconWrapper}>
            <span className={styles.tokenIcon}>
              {typeof getTokenIcon() === 'string' ? getTokenIcon() : getTokenIcon()}
            </span>
          </div>
          <div className={styles.tokenInfo}>
            <div className={styles.tokenNameRow}>
              <span className={styles.tokenName}>{name}</span>
              <span className={styles.tokenSymbol}>{symbol}USDT</span>
              <span className={styles.maxLeverage}>{maxLeverage}x</span>
            </div>
          </div>
        </div>

        {/* Price Section */}
        <div className={styles.priceSection}>
          <div className={styles.priceContainer}>
            <span className={styles.priceLabel}>Price</span>
            <div className={styles.priceRow}>
              <span className={styles.price}>${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span className={`${styles.priceChange} ${isPriceUp ? styles.positive : styles.negative}`}>
                {isPriceUp ? '▲' : '▼'} {Math.abs(priceChange).toFixed(2)}%
              </span>
            </div>
          </div>
        </div>

        {/* Market Stats Grid */}
        <div className={styles.statsGrid}>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Mark</span>
            <span className={styles.statValue}>${mark.toFixed(2)}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Index</span>
            <span className={styles.statValue}>${index.toFixed(2)}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Premium</span>
            <span className={`${styles.statValue} ${parseFloat(premium) > 0 ? styles.positive : styles.negative}`}>
              {premium}%
            </span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Volume</span>
            <span className={styles.statValue}>{formatUSD(volume24h)}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>OI</span>
            <span className={styles.statValue}>{formatUSD(openInterest)}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Funding</span>
            <span className={`${styles.statValue} ${fundingRate > 0 ? styles.positive : styles.negative}`}>
              {fundingRate > 0 ? '▲' : '▼'} {Math.abs(fundingRate).toFixed(4)}%
            </span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Next</span>
            <span className={styles.statValue}>{nextFunding}</span>
          </div>
        </div>
      </div>
    </div>
  );
}