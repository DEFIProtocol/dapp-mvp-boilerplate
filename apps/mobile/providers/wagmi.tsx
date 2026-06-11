import '@walletconnect/react-native-compat';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PropsWithChildren, useMemo } from 'react';
import { WagmiProvider, createConfig, createStorage, http } from 'wagmi';
import { walletConnect } from 'wagmi/connectors';
import { arbitrum, avalanche, base, bsc, mainnet, polygon } from 'wagmi/chains';

const walletConnectProjectId = process.env.EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID || '';

const config = createConfig({
  chains: [base, mainnet, polygon, arbitrum, bsc, avalanche],
  connectors: [
    walletConnect({
      projectId: walletConnectProjectId,
      metadata: {
        name: 'Dapp MVP Mobile',
        description: 'Dapp MVP mobile trading app',
        url: 'https://example.com',
        icons: ['https://walletconnect.com/walletconnect-logo.png'],
      },
      showQrModal: false,
    }),
  ],
  storage: createStorage({
    storage: AsyncStorage,
  }),
  transports: {
    [base.id]: http(),
    [mainnet.id]: http(),
    [polygon.id]: http(),
    [arbitrum.id]: http(),
    [bsc.id]: http(),
    [avalanche.id]: http(),
  },
});

export function MobileWagmiProvider({ children }: PropsWithChildren) {
  const queryClient = useMemo(() => new QueryClient(), []);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
