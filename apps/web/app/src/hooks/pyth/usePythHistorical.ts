// hooks/pyth/usePythHistorical.ts
"use client";
import { useState, useEffect, useCallback } from 'react';

export interface HistoricalPrice {
  price: number;
  ema_price: number | null;
  publish_time: number;
}

export function usePythHistorical(feedId: string, hours: number = 24) {
  const [data, setData] = useState<HistoricalPrice[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistorical = useCallback(async () => {
    try {
      const res = await fetch(`/api/pyth/historical/${feedId}?hours=${hours}`);
      const json = await res.json();
      
      if (json.success) {
        setData(json.data);
        setError(null);
      } else {
        setError(json.error || 'Failed to fetch');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [feedId, hours]);

  useEffect(() => {
    fetchHistorical();
  }, [fetchHistorical]);

  return { data, loading, error, refresh: fetchHistorical };
}