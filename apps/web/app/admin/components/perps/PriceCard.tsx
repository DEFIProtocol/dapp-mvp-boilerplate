// app/admin/components/perps/PriceCard.tsx
"use client";
import styles from './PriceCard.module.css';

interface PriceCardProps {
  token: string;
  // Chainlink data
  chainlinkPrice?: number;
  chainlinkTimestamp?: number;
  chainlinkRoundId?: string;
  // Pyth data
  pythPrice?: number;
  pythConfidence?: number;
  pythEmaPrice?: number;
  pythTimestamp?: number;
  // Funding rate
  fundingRate?: number;
  fundingRatePercent?: number;
  // State
  loading?: boolean;
  onClick?: () => void;
  isSelected?: boolean;
}

export default function PriceCard({ 
  token,
  // Chainlink
  chainlinkPrice,
  chainlinkTimestamp,
  chainlinkRoundId,
  // Pyth
  pythPrice,
  pythConfidence,
  pythEmaPrice,
  pythTimestamp,
  // Funding
  fundingRate,
  fundingRatePercent,
  // State
  loading = false,
  onClick,
  isSelected = false
}: PriceCardProps) {
  
  const getTokenIcon = () => {
    switch(token) {
      case 'BTC': return '₿';
      case 'ETH': return 'Ξ';
      case 'SOL': return 'S◎L';
      case 'AVAX': return 'A';
      case 'BNB': return 'B';
      case 'LINK': return 'L';
      default: return token.slice(0, 2);
    }
  };

  const getTokenClass = () => {
    switch(token) {
      case 'BTC': return styles.btc;
      case 'ETH': return styles.eth;
      case 'SOL': return styles.sol;
      default: return '';
    }
  };

  // Calculate price difference if both prices exist
  const priceDifference = chainlinkPrice && pythPrice 
    ? ((chainlinkPrice - pythPrice) / chainlinkPrice * 100).toFixed(2)
    : null;

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

  if (!chainlinkPrice && !pythPrice) {
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
      className={`${styles.card} ${getTokenClass()} ${isSelected ? styles.selected : ''}`}
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <div className={styles.header}>
        <span className={styles.tokenIcon}>{getTokenIcon()}</span>
        <span className={styles.tokenName}>{token}/USD</span>
        {fundingRatePercent !== undefined && (
          <span className={`${styles.fundingPill} ${fundingRate && fundingRate >= 0 ? styles.positive : styles.negative}`}>
            {fundingRatePercent.toFixed(4)}%
          </span>
        )}
        {isSelected && <span className={styles.selectedBadge}>✓</span>}
      </div>

      {/* Split view for Chainlink vs Pyth */}
      <div className={styles.splitContainer}>
        {/* Chainlink Side */}
        <div className={styles.oracleSide}>
          <div className={styles.oracleHeader}>
            <span className={styles.oracleBadge}>Chainlink</span>
            {chainlinkRoundId && (
              <span className={styles.roundId}>#{chainlinkRoundId.slice(0, 6)}</span>
            )}
          </div>
          {chainlinkPrice !== undefined ? (
            <div className={styles.oraclePrice}>
              <span className={styles.priceValue}>${chainlinkPrice.toFixed(2)}</span>
              {chainlinkTimestamp && (
                <span className={styles.timeValue}>
                  {new Date(chainlinkTimestamp).toLocaleTimeString()}
                </span>
              )}
            </div>
          ) : (
            <div className={styles.noData}>No data</div>
          )}
        </div>

        {/* Pyth Side */}
        <div className={styles.oracleSide}>
          <div className={styles.oracleHeader}>
            <span className={styles.pythBadge}>Pyth</span>
            {pythConfidence !== undefined && (
              <span className={styles.confidence}>
                ±${pythConfidence.toFixed(2)}
              </span>
            )}
          </div>
          {pythPrice !== undefined ? (
            <div className={styles.oraclePrice}>
              <span className={styles.priceValue}>${pythPrice.toFixed(2)}</span>
              {pythEmaPrice !== undefined && (
                <span className={styles.emaValue}>
                  EMA: ${pythEmaPrice.toFixed(2)}
                </span>
              )}
              {pythTimestamp && (
                <span className={styles.timeValue}>
                  {new Date(pythTimestamp).toLocaleTimeString()}
                </span>
              )}
            </div>
          ) : (
            <div className={styles.noData}>No data</div>
          )}
        </div>
      </div>

      {/* Price Difference Footer */}
      {priceDifference && (
        <div className={styles.differenceFooter}>
          <span>Difference: </span>
          <span className={styles.diffValue}>
            {parseFloat(priceDifference) > 0 ? '↑' : '↓'} 
            {Math.abs(parseFloat(priceDifference))}%
          </span>
        </div>
      )}
    </div>
  );
}