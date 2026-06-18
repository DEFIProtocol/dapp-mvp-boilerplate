'use client';

import { useState } from 'react';
import OpenOrdersPanel from './OpenOrdersPanel';
import OrderHistoryPanel from './OrderHistoryPanel';
import styles from './TradingTabs.module.css';

interface TradingTabsProps {
  address?: string;
  symbol?: string;
  positions: any[];
  pendingOrders: any[];
}

export default function TradingTabs({ address, symbol, positions, pendingOrders }: TradingTabsProps) {
  const [activeTab, setActiveTab] = useState<'positions' | 'orders' | 'history'>('positions');

  return (
    <div className={styles.container}>
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'positions' ? styles.active : ''}`}
          onClick={() => setActiveTab('positions')}
        >
          Positions ({positions.length})
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'orders' ? styles.active : ''}`}
          onClick={() => setActiveTab('orders')}
        >
          Open Orders
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'history' ? styles.active : ''}`}
          onClick={() => setActiveTab('history')}
        >
          History
        </button>
      </div>

      <div className={styles.content}>
        {activeTab === 'positions' && (
          <div className={styles.positionsPanel}>
            {!address && <div className={styles.emptyText}>Connect wallet to view positions</div>}
            {address && positions.length === 0 && <div className={styles.emptyText}>No open positions</div>}
            {positions.map((position) => (
              <div key={position.positionId} className={styles.positionRow}>
                <div className={styles.positionHeader}>
                  <span className={position.side === 'LONG' ? styles.long : styles.short}>
                    {position.side}
                  </span>
                  <span className={styles.symbol}>{symbol}</span>
                </div>
                <div className={styles.positionDetails}>
                  <div className={styles.detail}>
                    <span className={styles.label}>Size:</span>
                    <span>${parseFloat(position.exposureUsd).toFixed(2)}</span>
                  </div>
                  <div className={styles.detail}>
                    <span className={styles.label}>Entry:</span>
                    <span>${parseFloat(position.entryPriceUsd).toFixed(2)}</span>
                  </div>
                  <div className={styles.detail}>
                    <span className={styles.label}>PnL:</span>
                    <span className={parseFloat(position.unrealizedPnlUsd) >= 0 ? styles.profit : styles.loss}>
                      ${parseFloat(position.unrealizedPnlUsd).toFixed(2)}
                    </span>
                  </div>
                  <div className={styles.detail}>
                    <span className={styles.label}>Margin:</span>
                    <span>${parseFloat(position.marginUsd).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'orders' && (
          <OpenOrdersPanel address={address} symbol={symbol} />
        )}

        {activeTab === 'history' && (
          <OrderHistoryPanel address={address} symbol={symbol} />
        )}
      </div>
    </div>
  );
}
