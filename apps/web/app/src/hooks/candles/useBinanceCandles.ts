// hooks/exchange/useBinanceKlines.ts
"use client";
import { useState, useEffect, useCallback } from 'react';
import { Candle } from './types/candles';

interface UseBinanceKlinesOptions {
  interval?: string;
  limit?: number;
  autoFetch?: boolean;
}

export function useBinanceKlines(
  symbol: string, 
  options: UseBinanceKlinesOptions = {}
) {
  const { interval = '1h', limit = 100, autoFetch = true } = options;
  
  const [data, setData] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const fetchKlines = useCallback(async () => {
    if (!symbol) return;
    
    setIsTransitioning(true);
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch(`/api/binance/klines?symbol=${symbol}USDT&interval=${interval}&limit=${limit}`);
      const json = await res.json();
      console.log("Fetching klines with interval:", interval);
      if (json.success) {
        setData(json.data);
      } else {
        setError(json.error || 'Failed to fetch klines');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      // Keep transition state for animation
      setTimeout(() => setIsTransitioning(false), 300);
    }
  }, [symbol, interval, limit]);

  useEffect(() => {
    if (autoFetch && symbol) {
      fetchKlines();
    }
  }, [fetchKlines, autoFetch, symbol, interval]);

  return { 
    data, 
    loading, 
    error, 
    isTransitioning,
    refetch: fetchKlines 
  };
}