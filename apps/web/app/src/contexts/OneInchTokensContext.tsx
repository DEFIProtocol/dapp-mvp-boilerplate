"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

type OneInchTokensContextType = {
  chainId: number;
  setChainId: (id: number) => void;
  tokensList: any[];
  isLoading: boolean;
  error: string | null;
};

const OneInchContext = createContext<OneInchTokensContextType | undefined>(undefined);

// Client-side cache to avoid refetching
const clientCache = new Map<number, any[]>();

export function OneInchTokensProvider({ children }: { children: React.ReactNode }) {
  const [chainId, setChainId] = useState<number>(1);
  const [tokensList, setTokensList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTokens = useCallback(async (id: number) => {
    // Return cached data instantly
    if (clientCache.has(id)) {
      setTokensList(clientCache.get(id)!);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/1inch/tokens?chainId=${id}`);
      const json = await res.json();

      if (!json.success) throw new Error(json.error || "Failed to fetch tokens");

      const list = Object.values(json.data.tokens || {});
      clientCache.set(id, list);

      setTokensList(list);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Refetch when chainId changes
  useEffect(() => {
    fetchTokens(chainId);
  }, [chainId, fetchTokens]);

  return (
    <OneInchContext.Provider
      value={{
        chainId,
        setChainId,
        tokensList,
        isLoading,
        error,
      }}
    >
      {children}
    </OneInchContext.Provider>
  );
}

export function useOneInchTokens() {
  const ctx = useContext(OneInchContext);
  if (!ctx) throw new Error("useOneInch must be used inside <OneInchProvider>");
  return ctx;
}