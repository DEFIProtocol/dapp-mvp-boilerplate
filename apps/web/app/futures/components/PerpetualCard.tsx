// components/trading/PerpetualCard.tsx
"use client";
import { useState, useRef, useEffect } from 'react';
import { useAccount, useSignTypedData } from 'wagmi';
import { parseUnits } from 'viem';
import { getTraderPerpPositions, placePerpOrder } from '@/lib/api/perpsTrading';
import {
  ORDER_TYPES,
  buildOrderDomain,
  generateOrderExpiry,
  generateOrderNonce,
  getOrderSigningConfig,
  resolveMarketIdBytes32,
} from '@/lib/api/perpOrderSigning';
import type { OrderType, TraderPositionSnapshot, PendingPerpOrder } from '@/types/perpsTrading';
import { TrendingUp, TrendingDown, Settings, Lock, Edit2, Zap } from 'lucide-react';
import styles from './styles/PerpetualCard.module.css';

interface PerpetualCardProps {
  symbol: string;
  tokenName: string;
  perpAddress?: string;
  price: number;
  fundingRate?: number;
}

export default function PerpetualCard({ 
  symbol, 
  tokenName,
  perpAddress,
  price,
  fundingRate = 0.001,
}: PerpetualCardProps) {
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const [leverage, setLeverage] = useState(10);
  const [isEditingLeverage, setIsEditingLeverage] = useState(false);
  const [leverageInput, setLeverageInput] = useState('10');
  const [positionSize, setPositionSize] = useState<number | null>(null);
  const [orderType, setOrderType] = useState<OrderType>('market');
  const [limitPrice, setLimitPrice] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiMessage, setApiMessage] = useState<string | null>(null);
  const [positions, setPositions] = useState<TraderPositionSnapshot[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingPerpOrder[]>([]);
  const [markPriceUsd, setMarkPriceUsd] = useState<number>(0);
  
  const inputRef = useRef<HTMLInputElement>(null);

  const fundingRatePercent = fundingRate * 100;
  const trackFillPercentage = (leverage / 50) * 100;
  const isPositiveFunding = fundingRate >= 0;

  useEffect(() => {
    if (isEditingLeverage && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditingLeverage]);

  const refreshPositions = async () => {
    if (!address || !perpAddress) {
      setPositions([]);
      setPendingOrders([]);
      return;
    }

    setRefreshing(true);
    try {
      const snapshot = await getTraderPerpPositions(address, symbol, perpAddress);
      setPositions(snapshot.positions ?? []);
      setPendingOrders(snapshot.pendingOrders ?? []);
      setMarkPriceUsd(snapshot.markPriceUsd ?? 0);
      setApiError(null);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Failed to load trader positions');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!address || !perpAddress) return;
    refreshPositions();
    const timer = setInterval(refreshPositions, 15000);
    return () => clearInterval(timer);
  }, [address, perpAddress, symbol]);

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

  const handleSubmitOrder = async (side: 'LONG' | 'SHORT') => {
    if (!address) {
      setApiError('Connect wallet to place an order.');
      return;
    }

    if (!perpAddress) {
      setApiError(`No contract address configured for ${symbol}.`);
      return;
    }

    if (!positionSize || positionSize <= 0) {
      setApiError('Enter a position size before submitting.');
      return;
    }

    if (orderType === 'limit' && (!limitPrice || limitPrice <= 0)) {
      setApiError('Enter a valid limit price for limit orders.');
      return;
    }

    setSubmitting(true);
    setApiError(null);
    setApiMessage(null);

    try {
      const exposureUsd = positionSize * leverage;
      const hasLimitPrice = orderType === 'limit' && limitPrice !== null && limitPrice > 0;

      // Build the on-chain OrderLib.Order struct and ask the trader's wallet
      // to sign it via EIP-712. The order matching engine can only settle
      // this on-chain once matched against an opposing order if it carries
      // a real signature from `trader` - the backend cannot forge this.
      const signingConfig = await getOrderSigningConfig();
      const marketId = resolveMarketIdBytes32(symbol);
      const expiry = generateOrderExpiry();
      const nonce = generateOrderNonce();
      // Contracts store USD amounts as 18-decimal fixed point. Use viem's
      // parseUnits (string-based) rather than floating point math to avoid
      // precision loss once values are scaled by 1e18.
      const exposureWei = parseUnits(exposureUsd.toFixed(6), 18);
      const limitPriceWei = hasLimitPrice ? parseUnits((limitPrice as number).toFixed(6), 18) : 0n;

      const orderMessage = {
        trader: address as `0x${string}`,
        side: side === 'LONG' ? 0 : 1,
        exposure: exposureWei,
        limitPrice: limitPriceWei,
        expiry,
        nonce,
        marketId,
      };

      const signature = await signTypedDataAsync({
        domain: buildOrderDomain(signingConfig),
        types: ORDER_TYPES,
        primaryType: 'Order',
        message: orderMessage,
      });

      // Build the order request
      const orderRequest: any = {
        chainId: 84532, // Base Sepolia testnet
        symbol,
        perpAddress,
        trader: address,
        side,
        orderType,
        exposureUsd,
        leverage,
        expiry: Number(expiry),
        nonce: nonce.toString(),
        signature,
      };
      
      // Only include limitPrice if it's a limit order AND has a valid price
      if (hasLimitPrice) {
        orderRequest.limitPrice = limitPrice;
      }
      
      const response = await placePerpOrder(orderRequest);

      setApiMessage(`Order queued at mark $${(response.onChain?.markPriceUsd ?? 0).toFixed(2)}`);
      await refreshPositions();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Failed to place order');
    } finally {
      setSubmitting(false);
    }
  };

  const formatSigned = (value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return value;
    const sign = parsed > 0 ? '+' : '';
    return `${sign}${parsed.toFixed(2)}`;
  };

  const getTokenIcon = () => {
    const icons: Record<string, string> = {
      BTC: '₿',
      ETH: 'Ξ',
      SOL: '◎',
      BNB: '🟡',
      AVAX: '❄️',
    };
    return icons[symbol] || symbol.charAt(0);
  };

  return (
    <div className={styles.card}>
      <div className={styles.gradientBorder} />
      
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.symbolInfo}>
          <div className={styles.tokenIconWrapper}>
            <span className={styles.tokenIcon}>{getTokenIcon()}</span>
          </div>
          <div>
            <h3 className={styles.symbol}>{symbol}USDT Perpetual</h3>
            <div className={styles.contractMeta}>{tokenName}</div>
            <div className={styles.contractAddress}>
              {perpAddress ? `${perpAddress.slice(0, 6)}...${perpAddress.slice(-4)}` : 'No address'}
            </div>
            <span className={styles.maxLeverage}>Up to 50x</span>
          </div>
        </div>
        <div className={styles.fundingBadge}>
          <div className={`${styles.fundingRate} ${isPositiveFunding ? styles.positive : styles.negative}`}>
            {isPositiveFunding ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            <span>{Math.abs(fundingRatePercent).toFixed(4)}%</span>
          </div>
          <span className={styles.fundingLabel}>Funding</span>
        </div>
      </div>

      {/* Leverage Section */}
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
                <button className={styles.lockButton} onClick={handleLeverageSubmit}>
                  <Lock size={12} />
                </button>
              </div>
            ) : (
              <>
                <span className={styles.leverageValue}>{leverage}x</span>
                <button className={styles.editButton} onClick={() => setIsEditingLeverage(true)}>
                  <Edit2 size={12} />
                </button>
              </>
            )}
          </div>
        </div>

        <div className={styles.sliderWrapper} style={{
          background: `linear-gradient(to right, var(--neon-cyan) 0%, var(--neon-cyan) ${trackFillPercentage}%, var(--surface-3) ${trackFillPercentage}%, var(--surface-3) 100%)`
        }}>
          <input 
            type="range" 
            min="1" 
            max="50" 
            step="1"
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

      {/* Trading Section */}
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

        <div className={`${styles.orderInfo} ${positionSize ? styles.visible : styles.hidden}`}>
          <div className={styles.infoRow}>
            <span>Entry Price</span>
            <span>${(orderType === 'limit' && limitPrice ? limitPrice : price).toFixed(2)}</span>
          </div>
          <div className={styles.infoRow}>
            <span>Liquidation Price</span>
            <span className={styles.liquidation}>${calculateLiquidationPrice().toFixed(2)}</span>
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

        <div className={styles.actionButtons}>
          <button
            className={`${styles.actionBtn} ${styles.buyBtn}`}
            onClick={() => handleSubmitOrder('LONG')}
            disabled={submitting}
          >
            <TrendingUp size={14} />
            <span>{orderType === 'limit' ? 'Place Limit' : 'Long'}</span>
          </button>
          <button
            className={`${styles.actionBtn} ${styles.sellBtn}`}
            onClick={() => handleSubmitOrder('SHORT')}
            disabled={submitting}
          >
            <TrendingDown size={14} />
            <span>{orderType === 'limit' ? 'Place Limit' : 'Short'}</span>
          </button>
        </div>
        
        {apiError && <div className={styles.errorText}>{apiError}</div>}
        {apiMessage && <div className={styles.successText}>{apiMessage}</div>}
      </div>

      {positionSize && (
        <div className={styles.riskWarning}>
          <Zap size={12} />
          <span>Liquidation at ${calculateLiquidationPrice().toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}