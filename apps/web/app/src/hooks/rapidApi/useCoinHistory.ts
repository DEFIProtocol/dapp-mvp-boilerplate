// apps/web/app/src/hooks/rapidapi/useCoinHistory.ts
"use client";

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

export interface CoinHistoryPoint {
  price: string;
  timestamp: number;
}

export interface CoinHistoryData {
  change: string;
  history: CoinHistoryPoint[];
}

export interface UseCoinHistoryOptions {
  coinId: string;
  timePeriod?: '24h' | '7d' | '30d' | '1y' | '5y';
  autoFetch?: boolean;
}

export interface UseCoinHistoryReturn {
  data: CoinHistoryData | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  historyPoints: CoinHistoryPoint[];
  priceChange: number | null;
}

export function useCoinHistory({
  coinId,
  timePeriod = '24h',
  autoFetch = true,
}: UseCoinHistoryOptions): UseCoinHistoryReturn {
  const [data, setData] = useState<CoinHistoryData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!coinId) {
      setError(new Error('Coin ID is required'));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await axios.get(`/api/rapidapi/coin/${coinId}/history`, {
        params: { timePeriod },
      });

      if (response.data?.success) {
        setData(response.data.data);
      } else {
        throw new Error(response.data?.error || 'Failed to fetch coin history');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(new Error(errorMessage));
      console.error('useCoinHistory error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [coinId, timePeriod]);

  useEffect(() => {
    if (autoFetch && coinId) {
      fetchHistory();
    }
  }, [autoFetch, coinId, timePeriod, fetchHistory]);

  // Helper: parse price change as number
  const priceChange = data?.change ? parseFloat(data.change) : null;

  // Helper: get history points array
  const historyPoints = data?.history || [];

  return {
    data,
    isLoading,
    error,
    refetch: fetchHistory,
    historyPoints,
    priceChange,
  };
}