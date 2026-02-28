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

// Map of chain names to IDs (in case you need it)
export const CHAIN_IDS = {
  ethereum: 1,
  polygon: 137,
  arbitrum: 42161,
  bsc: 56,
  avalanche: 43114
};

// Available chains for selectors
export const CHAINS = [
  { id: 1, label: "Ethereum" },
  { id: 137, label: "Polygon" },
  { id: 42161, label: "Arbitrum" },
  { id: 56, label: "BSC" },
  { id: 43114, label: "Avalanche" },
];

// Client-side cache to avoid refetching
const clientCache = new Map<number, any[]>();

export function OneInchTokensProvider({ children }: { children: React.ReactNode }) {
  const [chainId, setChainId] = useState<number>(1); // Default to Ethereum (1)
  const [tokensList, setTokensList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTokens = useCallback(async (id: number) => {
    console.log(`Fetching 1inch tokens for chain ID ${id}...`);
    
    // Return cached data instantly
    if (clientCache.has(id)) {
      console.log(`Using cached data for chain ${id}`);
      setTokensList(clientCache.get(id)!);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Use the numeric ID directly
      const url = `/api/1inch/tokens?chainId=${id}`;
      console.log(`Fetching from: ${url}`);
      
      const res = await fetch(url);
      console.log(`Response status: ${res.status}`);
      
      if (!res.ok) {
        let errorDetails = '';
        try {
          const errorText = await res.text();
          console.error('Error response body:', errorText);
          errorDetails = errorText;
        } catch (e) {}
        throw new Error(`HTTP error! status: ${res.status} - ${errorDetails}`);
      }
      
      const json = await res.json();
      console.log('Response data:', json);

      if (!json.success) throw new Error(json.error || "Failed to fetch tokens");

      // Handle your backend response structure
      let list = [];
      
      if (json.data?.tokens) {
        list = Object.values(json.data.tokens);
      } else if (Array.isArray(json.data)) {
        list = json.data;
      } else if (json.data && typeof json.data === 'object') {
        list = Object.values(json.data);
      } else if (json.tokens) {
        list = Object.values(json.tokens);
      }

      console.log(`✅ Found ${list.length} tokens for chain ID ${id}`);
      
      clientCache.set(id, list);
      setTokensList(list);
    } catch (err: any) {
      console.error('Error fetching 1inch tokens:', err);
      setError(err.message);
      setTokensList([]);
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