// hooks/oracle/useOracleRound.ts
"use client";
import { useState, useEffect, useCallback } from 'react';

export interface RoundData {
  roundId: string;
  price: number;
  timestamp: number;
  startedAt: number;
  answeredInRound?: string;
}

export function useOracleRound(chain: string, token: string, pollInterval?: number) {
  const [data, setData] = useState<RoundData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRound = useCallback(async () => {
    try {
      const res = await fetch(`/api/oracle/latest/${chain}/${token}`);
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
  }, [chain, token]);

  useEffect(() => {
    fetchRound();
    if (pollInterval) {
      const interval = setInterval(fetchRound, pollInterval);
      return () => clearInterval(interval);
    }
  }, [fetchRound, pollInterval]);

  return { data, loading, error, refresh: fetchRound };
}

export function useOracleSpecificRound(chain: string, token: string, roundId: string) {
  const [data, setData] = useState<RoundData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRound = async () => {
      try {
        const res = await fetch(`/api/oracle/round/${chain}/${token}/${roundId}`);
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
    };
    fetchRound();
  }, [chain, token, roundId]);

  return { data, loading, error };
}