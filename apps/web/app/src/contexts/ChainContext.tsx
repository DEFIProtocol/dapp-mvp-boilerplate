"use client";

import { createContext, useContext, useState, ReactNode } from "react";

// Define your supported chains
const CHAINS = [
  { id: 1, label: "Ethereum" },
  { id: 137, label: "Polygon" },
  { id: 42161, label: "Arbitrum" },
  { id: 56, label: "BSC" },
  { id: 43114, label: "Avalanche" },
];

type ChainContextType = {
  selectedChain: number;
  setSelectedChain: (id: number) => void;
  availableChains: { id: number; label: string }[];
  getChainLabel: (id: number) => string;
};

const ChainContext = createContext<ChainContextType | undefined>(undefined);

function ChainProvider({ children }: { children: ReactNode }) {
  const [selectedChain, setSelectedChain] = useState<number>(1);

  const getChainLabel = (id: number) =>
    CHAINS.find((c) => c.id === id)?.label || "Unknown";

  return (
    <ChainContext.Provider
      value={{
        selectedChain,
        setSelectedChain,
        availableChains: CHAINS,
        getChainLabel,
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