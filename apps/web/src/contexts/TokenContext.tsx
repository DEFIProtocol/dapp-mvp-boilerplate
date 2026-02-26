"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { getAllTokens, Token } from "../lib/api/tokens";

interface TokenContextType {
  tokens: Token[];
  loading: boolean;
  getTokenBySymbol: (symbol: string) => Token | undefined;
  getTokenAddress: (token: Token, chainId: string | number) => string | null;
}

const TokenContext = createContext<TokenContextType | undefined>(undefined);

export function TokenProvider({ children }: { children: ReactNode }) {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTokens = async () => {
      try {
        const data = await getAllTokens();
        setTokens(data);
      } catch (error) {
        console.error("Error loading tokens:", error);
      } finally {
        setLoading(false);
      }
    };

    loadTokens();
  }, []);

  const getTokenBySymbol = (symbol: string) => {
    return tokens.find(
      (t) => t.symbol.toLowerCase() === symbol.toLowerCase()
    );
  };

  const getTokenAddress = (token: Token, chainId: string | number) => {
    const chainIdStr = String(chainId);
    return token.addresses?.[chainIdStr] || null;
  };

  return (
    <TokenContext.Provider
      value={{
        tokens,
        loading,
        getTokenBySymbol,
        getTokenAddress,
      }}
    >
      {children}
    </TokenContext.Provider>
  );
}

export function useTokens() {
  const context = useContext(TokenContext);
  if (context === undefined) {
    throw new Error("useTokens must be used within a TokenProvider");
  }
  return context;
}