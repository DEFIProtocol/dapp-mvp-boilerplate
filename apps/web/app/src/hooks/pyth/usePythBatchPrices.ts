// hooks/pyth/usePythBatchPrices.ts
"use client";
import { useState, useEffect, useCallback } from 'react';

export interface BatchPriceData {
  [key: string]: {
    price: number;
    ema_price: number | null;
    conf: number;
  };
}

export function usePythBatchPrices(feedIds: string[], pollInterval?: number) {
  const [data, setData] = useState<BatchPriceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBatchPrices = useCallback(async () => {
    if (!feedIds.length) return;
    
    try {
      const res = await fetch('/api/pyth/prices/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedIds })
      });
      const json = await res.json();
      
      if (json.success) {
        // Transform the data to a more usable format
        const transformed: BatchPriceData = {};
        Object.entries(json.data).forEach(([id, feed]: [string, any]) => {
          transformed[id] = {
            price: feed.price.price * Math.pow(10, feed.price.expo),
            ema_price: feed.ema_price ? feed.ema_price.price * Math.pow(10, feed.ema_price.expo) : null,
            conf: feed.price.conf * Math.pow(10, feed.price.expo)
          };
        });
        setData(transformed);
        setError(null);
      } else {
        setError(json.error || 'Failed to fetch');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [feedIds]);

  useEffect(() => {
    fetchBatchPrices();
    if (pollInterval && feedIds.length) {
      const interval = setInterval(fetchBatchPrices, pollInterval);
      return () => clearInterval(interval);
    }
  }, [fetchBatchPrices, pollInterval, feedIds.join(',')]);

  return { data, loading, error, refresh: fetchBatchPrices };
}