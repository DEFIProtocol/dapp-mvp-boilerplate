import { getSpotOrderBook, getSpotOrderIntents } from "@dapp/trading-api";
import type { SpotOrderBookResponse, SpotOrderIntent } from "@dapp/trading-types/spot";
import { useCallback } from "react";
import { usePollingResource, type PollingOptions } from "./polling";

export function useSpotOrderBookPolling(
  symbol: string,
  depth = 8,
  options: PollingOptions = {},
) {
  const fetcher = useCallback(async (): Promise<SpotOrderBookResponse> => {
    return getSpotOrderBook(symbol, depth);
  }, [symbol, depth]);

  return usePollingResource(fetcher, options);
}

export function useSpotOrderIntentsPolling(
  trader: string | null | undefined,
  symbol?: string,
  options: PollingOptions = {},
) {
  const enabled = Boolean(options.enabled ?? true) && Boolean(trader);
  const fetcher = useCallback(async (): Promise<SpotOrderIntent[]> => {
    if (!trader) return [];
    return getSpotOrderIntents(trader, symbol);
  }, [trader, symbol]);

  return usePollingResource(fetcher, { ...options, enabled });
}
