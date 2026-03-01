"use client";

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { PerpsToken } from '@/types/perps';

interface PerpsContextType {
  tokens: PerpsToken[];
  activeTokens: PerpsToken[];
  loading: boolean;
  error: string | null;
  refreshTokens: () => Promise<void>;
  getTokenBySymbol: (symbol: string) => PerpsToken | undefined;
}

const PerpsContext = createContext<PerpsContextType | undefined>(undefined);

export function PerpsProvider({ children }: { children: ReactNode }) {
  const [tokens, setTokens] = useState<PerpsToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTokens = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/perps/db');
      const data = await res.json();
      
      if (Array.isArray(data)) {
        setTokens(data);
      } else if (data.data && Array.isArray(data.data)) {
        setTokens(data.data);
      } else {
        setTokens([]);
        setError('Invalid response format');
      }
    } catch (err: any) {
      setError(err.message);
      setTokens([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTokens();
  }, []);

  const activeTokens = tokens.filter(t => t.is_active !== false);

  const getTokenBySymbol = (symbol: string) => {
    return tokens.find(t => t.symbol.toLowerCase() === symbol.toLowerCase());
  };

  return (
    <PerpsContext.Provider value={{
      tokens,
      activeTokens,
      loading,
      error,
      refreshTokens: fetchTokens,
      getTokenBySymbol
    }}>
      {children}
    </PerpsContext.Provider>
  );
}

export function usePerps() {
  const context = useContext(PerpsContext);
  if (!context) {
    throw new Error('usePerps must be used within a PerpsProvider');
  }
  return context;
}