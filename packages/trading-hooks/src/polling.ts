import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

export type PollingOptions = {
  intervalMs?: number;
  enabled?: boolean;
};

export type PollingResult<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setData: Dispatch<SetStateAction<T | null>>;
};

export function usePollingResource<T>(
  fetcher: () => Promise<T>,
  options: PollingOptions = {},
): PollingResult<T> {
  const { intervalMs = 2500, enabled = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!enabled || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const next = await fetcher();
      setData(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh resource");
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, [enabled, fetcher]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    setLoading(true);
    void refresh();

    const timer = setInterval(() => {
      void refresh();
    }, intervalMs);

    return () => clearInterval(timer);
  }, [enabled, intervalMs, refresh]);

  return { data, loading, error, refresh, setData };
}
