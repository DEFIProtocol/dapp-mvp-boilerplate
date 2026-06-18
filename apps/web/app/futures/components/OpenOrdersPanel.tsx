'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { getOpenOrders, cancelOrder, type PerpOrder } from '../../src/lib/api/perpOrders';
import styles from './OpenOrdersPanel.module.css';

interface OpenOrdersPanelProps {
  address?: string;
  symbol?: string;
}

export default function OpenOrdersPanel({ address, symbol }: OpenOrdersPanelProps) {
  const [orders, setOrders] = useState<PerpOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;

    const fetchOrders = async () => {
      setLoading(true);
      try {
        const allOrders = await getOpenOrders(address);
        // Filter by symbol if provided
        const filtered = symbol 
          ? allOrders.filter(o => o.symbol === symbol.toUpperCase())
          : allOrders;
        setOrders(filtered);
      } catch (error) {
        console.error('Error fetching orders:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
    const interval = setInterval(fetchOrders, 5000); // Refresh every 5s

    return () => clearInterval(interval);
  }, [address, symbol]);

  const handleCancel = async (orderId: string) => {
    setCancelling(orderId);
    try {
      await cancelOrder(orderId);
      // Remove from list
      setOrders(prev => prev.filter(o => o.order_id !== orderId));
    } catch (error) {
      console.error('Error cancelling order:', error);
      alert('Failed to cancel order');
    } finally {
      setCancelling(null);
    }
  };

  if (!address) {
    return (
      <div className={styles.emptyState}>
        <p>Connect wallet to view open orders</p>
      </div>
    );
  }

  if (loading && orders.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p>Loading orders...</p>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p>No open orders</p>
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
          <div>Time</div>
          <div>Action</div>
        </div>
        {orders.map((order) => (
          <div key={order.order_id} className={styles.row}>
            <div className={styles.symbol}>{order.symbol}</div>
            <div className={order.side === 'LONG' ? styles.long : styles.short}>
              {order.side}
            </div>
            <div>{order.order_type}</div>
            <div>${parseFloat(order.original_size).toFixed(2)}</div>
            <div>
              ${parseFloat(order.filled_size).toFixed(2)} / ${parseFloat(order.original_size).toFixed(2)}
            </div>
            <div>
              {order.limit_price ? `$${parseFloat(order.limit_price).toFixed(2)}` : 'Market'}
            </div>
            <div>
              <span className={styles[order.status]}>{order.status}</span>
            </div>
            <div className={styles.time}>
              {new Date(order.created_at).toLocaleTimeString()}
            </div>
            <div>
              <button
                className={styles.cancelBtn}
                onClick={() => handleCancel(order.order_id)}
                disabled={cancelling === order.order_id}
              >
                {cancelling === order.order_id ? (
                  'Cancelling...'
                ) : (
                  <X size={16} />
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
