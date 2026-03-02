// hooks/pyth/usePythFundingRate.ts
"use client";
import { useState, useEffect, useCallback } from 'react';

export interface FundingRateData {
  feedId: string;
  spot_price: number;
  ema_price: number;
  funding_rate: number;
  funding_rate_percent: number;
  annualized_rate: number;
}

export function usePythFundingRate(feedId: string, pollInterval?: number) {
  const [data, setData] = useState<FundingRateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFundingRate = useCallback(async () => {
    try {
      const res = await fetch(`/api/pyth/funding-rate/${feedId}`);
      const json = await res.json();
      
      if (json.success) {
        setData(json);
        setError(null);
      } else {
        setError(json.error || 'Failed to fetch');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [feedId]);

  useEffect(() => {
    fetchFundingRate();
    if (pollInterval) {
      const interval = setInterval(fetchFundingRate, pollInterval);
      return () => clearInterval(interval);
    }
  }, [fetchFundingRate, pollInterval]);

  return { data, loading, error, refresh: fetchFundingRate };
}