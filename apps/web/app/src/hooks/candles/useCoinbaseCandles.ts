// hooks/exchange/useCoinbaseCandles.ts
"use client";
import { useState, useEffect, useCallback } from 'react';
import { Candle } from './types/candles';

interface UseCoinbaseCandlesOptions {
  granularity?: number; // 60, 300, 900, 3600, 21600, 86400
  autoFetch?: boolean;
}

export function useCoinbaseCandles(
  productId: string, // e.g., "BTC-USD"
  options: UseCoinbaseCandlesOptions = {}
) {
  const { granularity = 3600, autoFetch = true } = options;
  
  const [data, setData] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCandles = useCallback(async () => {
    if (!productId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch(`/api/coinbase/candles?product_id=${productId}&granularity=${granularity}`);
      const json = await res.json();
      
      if (json.success) {
        setData(json.data);
      } else {
        setError(json.error || 'Failed to fetch candles');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [productId, granularity]);

  useEffect(() => {
    if (autoFetch && productId) {
      fetchCandles();
    }
  }, [fetchCandles, autoFetch, productId]);

  return { data, loading, error, refetch: fetchCandles };
}