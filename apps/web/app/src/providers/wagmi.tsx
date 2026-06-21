"use client";

import { WagmiProvider, createConfig, http } from "wagmi";
import { mainnet, base, polygon, arbitrum, bsc, avalanche } from "wagmi/chains";
import { baseSepolia } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const config = createConfig({
  chains: [base, baseSepolia, mainnet, polygon, arbitrum, bsc, avalanche],
  transports: {
    [base.id]: http(
      process.env.NEXT_PUBLIC_INFURA_API_KEY
        ? `https://base-mainnet.infura.io/v3/${process.env.NEXT_PUBLIC_INFURA_API_KEY}`
        : undefined
    ),
    [baseSepolia.id]: http('https://base-sepolia.blockpi.network/v1/rpc/public'),
    [mainnet.id]: http(
      process.env.NEXT_PUBLIC_INFURA_API_KEY
        ? `https://mainnet.infura.io/v3/${process.env.NEXT_PUBLIC_INFURA_API_KEY}`
        : undefined
    ),
    [polygon.id]: http(
      process.env.NEXT_PUBLIC_INFURA_API_KEY
        ? `https://polygon-mainnet.infura.io/v3/${process.env.NEXT_PUBLIC_INFURA_API_KEY}`
        : undefined
    ),
    [arbitrum.id]: http(
      process.env.NEXT_PUBLIC_INFURA_API_KEY
        ? `https://arbitrum-mainnet.infura.io/v3/${process.env.NEXT_PUBLIC_INFURA_API_KEY}`
        : undefined
    ),
    [bsc.id]: http('https://bsc-dataseed.binance.org'),
    [avalanche.id]: http('https://api.avax.network/ext/bc/C/rpc'),
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