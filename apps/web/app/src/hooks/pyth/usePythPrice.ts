// hooks/pyth/usePythPrice.ts
"use client";
import { useState, useEffect, useCallback } from 'react';

export interface PythPriceData {
  id: string;
  price: number;
  conf: number;
  ema_price: number | null;
  publish_time: number;
  confidence: number;
}

export function usePythPrice(chain: string, symbol: string, pollInterval?: number) {
  const [data, setData] = useState<PythPriceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPrice = useCallback(async () => {
    try {
      const res = await fetch(`/api/pyth/price/${chain}/${symbol}`);
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
  }, [chain, symbol]);

  useEffect(() => {
    fetchPrice();
    if (pollInterval) {
      const interval = setInterval(fetchPrice, pollInterval);
      return () => clearInterval(interval);
    }
  }, [fetchPrice, pollInterval]);

  return { data, loading, error, refresh: fetchPrice };
}