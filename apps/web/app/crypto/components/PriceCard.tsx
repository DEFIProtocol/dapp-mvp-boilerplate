"use client";
import styles from './PriceCard.module.css';

interface PriceCardProps {
  token: string;
  price?: number;
  timestamp?: number;
  roundId?: string;
  loading?: boolean;
  onClick?: () => void;  // Add this
  isSelected?: boolean;   // Add this
}

export default function PriceCard({ 
  token, 
  price, 
  timestamp, 
  roundId, 
  loading,
  onClick,
  isSelected 
}: PriceCardProps) {
  const getTokenIcon = () => {
    switch(token) {
      case 'BTC': return '₿';
      case 'ETH': return 'Ξ';
      case 'SOL': return 'S◎L';
      default: return token.slice(0, 2);
    }
  };

  if (loading) {
    return (
      <div className={`${styles.card} ${styles.loading}`}>
        <div className={styles.header}>
          <span className={styles.tokenIcon}>{getTokenIcon()}</span>
          <span className={styles.tokenName}>{token}</span>
        </div>
        <div className={styles.spinner}></div>
      </div>
    );
  }

  if (!price) {
    return (
      <div className={`${styles.card} ${styles.error}`}>
        <div className={styles.header}>
          <span className={styles.tokenIcon}>⚠️</span>
          <span className={styles.tokenName}>{token}</span>
        </div>
        <div className={styles.errorMessage}>No data</div>
      </div>
    );
  }

  return (
    <div 
      className={`${styles.card} ${isSelected ? styles.selected : ''}`}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <div className={styles.header}>
        <span className={styles.tokenIcon}>{getTokenIcon()}</span>
        <span className={styles.tokenName}>{token}/USD</span>
        {isSelected && <span className={styles.selectedBadge}>✓</span>}
      </div>

      <div className={styles.priceContainer}>
        <div className={styles.price}>${price.toFixed(2)}</div>
        {timestamp && (
          <div className={styles.timestamp}>
            {new Date(timestamp).toLocaleTimeString()}
          </div>
        )}
      </div>

      {roundId && (
        <div className={styles.footer}>
          <span className={styles.roundId}>Round: {roundId.slice(0, 8)}...</span>
        </div>
      )}
    </div>
  );
}