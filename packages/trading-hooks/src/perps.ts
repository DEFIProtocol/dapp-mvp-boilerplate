import { getPerpsOrderBook, getTraderPerpPositions } from "@dapp/trading-api";
import type { PendingPerpOrder, PerpsOrderBookResponse } from "@dapp/trading-types/perps";
import { useCallback } from "react";
import { usePollingResource, type PollingOptions } from "./polling";

export function usePerpsOrderBookPolling(
  symbol: string,
  depth = 8,
  options: PollingOptions = {},
) {
  const fetcher = useCallback(async (): Promise<PerpsOrderBookResponse> => {
    return getPerpsOrderBook(symbol, depth);
  }, [symbol, depth]);

  return usePollingResource(fetcher, options);
}

export function usePerpsPendingOrdersPolling(
  trader: string | null | undefined,
  symbol: string,
  perpAddress: string | null | undefined,
  options: PollingOptions = {},
) {
  const enabled = Boolean(options.enabled ?? true) && Boolean(trader) && Boolean(perpAddress);
  const fetcher = useCallback(async (): Promise<PendingPerpOrder[]> => {
    if (!trader || !perpAddress) return [];
    const snapshot = await getTraderPerpPositions(trader, symbol, perpAddress);
    return snapshot.pendingOrders;
  }, [trader, symbol, perpAddress]);

  return usePollingResource(fetcher, { ...options, enabled });
}
