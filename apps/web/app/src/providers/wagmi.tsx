"use client";

import { WagmiProvider, createConfig, http } from "wagmi";
import { mainnet, base, polygon, arbitrum, bsc, avalanche } from "wagmi/chains";
import { baseSepolia } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const config = createConfig({
  chains: [base, baseSepolia, mainnet, polygon, arbitrum, bsc, avalanche],
  transports: {
    [base.id]: http(),
    [baseSepolia.id]: http(),
    [mainnet.id]: http(),
    [polygon.id]: http(),
    [arbitrum.id]: http(),
    [bsc.id]: http(),
    [avalanche.id]: http(),
  },
  ssr: true,
});

const queryClient = new QueryClient();

export function WagmiProviderWrapper({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}