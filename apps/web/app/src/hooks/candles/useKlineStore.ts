"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { Candle } from "./types/candles";

interface UseKlinesOptions {
  interval?: string;
  limit?: number;
  autoFetch?: boolean;
}

const intervalToMs = (interval: string): number => {
  const match = interval.trim().toLowerCase().match(/^(\d+)([smhd])$/);
  if (!match) return 60_000;

  const value = Number(match[1]);
  const unit = match[2];

  if (unit === "s") return value * 1_000;
  if (unit === "m") return value * 60_000;
  if (unit === "h") return value * 3_600_000;
  if (unit === "d") return value * 86_400_000;

  return 60_000;
};

const normalizeCandles = (candles: Candle[]): Candle[] => {
  return [...candles].sort((left, right) => left.timestamp - right.timestamp);
};

export function useKlinesStore(
  symbol: string,
  options: UseKlinesOptions = {}
) {
  const { interval = "1h", limit = 1000, autoFetch = true } = options;

  const [data, setData] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [exchange, setExchange] = useState<string>("");
  const isFetchingRef = useRef(false);

  const fetchKlines = useCallback(async (options?: { silent?: boolean }) => {
    if (!symbol) return;
    if (isFetchingRef.current) return;

    const silent = Boolean(options?.silent);
    isFetchingRef.current = true;

    if (!silent) {
      setIsTransitioning(true);
      setLoading(true);
      setError(null);
    }

    try {
      const res = await fetch(
        `/api/klines?symbol=${symbol}USDT&interval=${interval}&limit=${limit}`
      );

      const json = await res.json();

      if (json.success) {
        setData(normalizeCandles(json.data));
        setExchange(json.exchange);
      } else {
        setError(json.error || "Failed to fetch klines");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      if (!silent) {
        setLoading(false);
        setTimeout(() => setIsTransitioning(false), 300);
      }
      isFetchingRef.current = false;
    }
  }, [symbol, interval, limit]);

  useEffect(() => {
    if (!autoFetch || !symbol) return;

    let boundaryTimer: ReturnType<typeof setTimeout> | null = null;

    fetchKlines();

    const intervalMs = intervalToMs(interval);
    const livePollMs = Math.min(10_000, Math.max(1_500, Math.floor(intervalMs / 20)));

    const pollId = setInterval(() => {
      fetchKlines({ silent: true });
    }, livePollMs);

    const scheduleBoundaryRefresh = () => {
      const now = Date.now();
      const nextBoundary = Math.ceil(now / intervalMs) * intervalMs + 75;
      const delay = Math.max(250, nextBoundary - now);

      boundaryTimer = setTimeout(() => {
        fetchKlines({ silent: true });
        scheduleBoundaryRefresh();
      }, delay);
    };

    scheduleBoundaryRefresh();

    return () => {
      clearInterval(pollId);
      if (boundaryTimer) clearTimeout(boundaryTimer);
    };
  }, [fetchKlines, autoFetch, symbol, interval]);

  return {
    data,
    loading,
    error,
    isTransitioning,
    exchange,
    refetch: fetchKlines,
  };
}