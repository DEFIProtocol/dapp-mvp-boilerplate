// hooks/pyth/usePythPriceWithConfidence.ts
"use client";
import { useState, useEffect, useCallback } from 'react';

export interface PriceWithConfidence {
  price: number;
  confidence: number;
  timestamp: number;
  confidence_percent: number;
}

export function usePythPriceWithConfidence(feedId: string, pollInterval?: number) {
  const [data, setData] = useState<PriceWithConfidence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPriceWithConfidence = useCallback(async () => {
    try {
      const res = await fetch(`/api/pyth/price-with-confidence/${feedId}`);
      const json = await res.json();
      
      if (json.success) {
        // Calculate confidence percentage
        const confidencePercent = (json.data.confidence / json.data.price) * 100;
        setData({
          ...json.data,
          confidence_percent: confidencePercent
        });
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
    fetchPriceWithConfidence();
    if (pollInterval) {
      const interval = setInterval(fetchPriceWithConfidence, pollInterval);
      return () => clearInterval(interval);
    }
  }, [fetchPriceWithConfidence, pollInterval]);

  return { data, loading, error, refresh: fetchPriceWithConfidence };
}