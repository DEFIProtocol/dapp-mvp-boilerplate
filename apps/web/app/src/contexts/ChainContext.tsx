"use client";

import { createContext, useContext, useState, ReactNode } from "react";

// Define your supported chains
const CHAINS = [
  { id: 8453, label: "Base", slug: "base" },
  { id: 84532, label: "Base Sepolia", slug: "base-sepolia" },
  { id: 1, label: "Ethereum", slug: "ethereum" },
  { id: 137, label: "Polygon", slug: "polygon" },
  { id: 42161, label: "Arbitrum", slug: "arbitrum" },
  { id: 56, label: "Binance Smart Chain", slug: "bsc" },
  { id: 43114, label: "Avalanche", slug: "avalanche" },
];

type ChainContextType = {
  selectedChain: number;
  setSelectedChain: (id: number) => void;
  availableChains: { id: number; label: string; slug: string }[];
  getChainLabel: (id: number) => string;
  getChainSlug: (id: number) => string;
  getChainIdBySlug: (slug: string) => number | null;
};

const ChainContext = createContext<ChainContextType | undefined>(undefined);

function ChainProvider({ children }: { children: ReactNode }) {
  const [selectedChain, setSelectedChain] = useState<number>(8453);

  const getChainLabel = (id: number) =>
    CHAINS.find((c) => c.id === id)?.label || "Unknown";

  const getChainSlug = (id: number) =>
    CHAINS.find((c) => c.id === id)?.slug || "base";

  const getChainIdBySlug = (slug: string) =>
    CHAINS.find((c) => c.slug.toLowerCase() === slug.toLowerCase())?.id || null;

  return (
    <ChainContext.Provider
      value={{
        selectedChain,
        setSelectedChain,
        availableChains: CHAINS,
        getChainLabel,
        getChainSlug,
        getChainIdBySlug,
      }}
    >
      {children}
    </ChainContext.Provider>
  );
}

// Named export stays named
export function useChainContext() {
  const ctx = useContext(ChainContext);
  if (!ctx) {
    throw new Error("useChainContext must be used inside <ChainProvider>");
  }
  return ctx;
}

// Default export for the provider
export default ChainProvider;