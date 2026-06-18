'use client';

import { useState, useEffect } from 'react';
import { getOrderHistory } from '../../src/lib/api/perpOrders';
import styles from './OrderHistoryPanel.module.css';

interface OrderHistoryPanelProps {
  address?: string;
  symbol?: string;
}

export default function OrderHistoryPanel({ address, symbol }: OrderHistoryPanelProps) {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) return;

    const fetchHistory = async () => {
      setLoading(true);
      try {
        const data = await getOrderHistory(address, 50);
        // Filter by symbol if provided
        const filtered = symbol 
          ? data.filter(h => h.symbol === symbol.toUpperCase())
          : data;
        setHistory(filtered);
      } catch (error) {
        console.error('Error fetching order history:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
    const interval = setInterval(fetchHistory, 10000); // Refresh every 10s

    return () => clearInterval(interval);
  }, [address, symbol]);

  if (!address) {
    return (
      <div className={styles.emptyState}>
        <p>Connect wallet to view order history</p>
      </div>
    );
  }

  if (loading && history.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p>Loading history...</p>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p>No order history</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.table}>
        <div className={styles.header}>
          <div>Symbol</div>
          <div>Side</div>
          <div>Type</div>
          <div>Size</div>
          <div>Filled</div>
          <div>Price</div>
          <div>Status</div>
          <div>Event</div>
          <div>Time</div>
        </div>
        {history.map((item, index) => (
          <div key={`${item.order_id}-${index}`} className={styles.row}>
            <div className={styles.symbol}>{item.symbol}</div>
            <div className={item.side === 'LONG' ? styles.long : styles.short}>
              {item.side}
            </div>
            <div>{item.order_type}</div>
            <div>${parseFloat(item.original_size || '0').toFixed(2)}</div>
            <div>${parseFloat(item.filled_size || '0').toFixed(2)}</div>
            <div>
              {item.limit_price ? `$${parseFloat(item.limit_price).toFixed(2)}` : 'Market'}
            </div>
            <div>
              <span className={styles[item.status]}>{item.status}</span>
            </div>
            <div>
              {item.event_type && (
                <span className={styles.event}>{item.event_type}</span>
              )}
            </div>
            <div className={styles.time}>
              {new Date(item.event_timestamp || item.created_at).toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
