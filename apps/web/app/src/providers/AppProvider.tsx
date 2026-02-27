"use client";

import { ReactNode } from "react";
import { WagmiProviderWrapper } from "./wagmi";
import ChainProvider from "@/contexts/ChainContext";
import ThemeProvider from "@/contexts/ThemeContext";
import { UserProvider } from "@/contexts/UserContext";
import { TokenProvider } from "@/contexts/TokenContext";
import { PriceStoreProvider } from "@/contexts/PriceStoreContext";
import { OneInchTokensProvider } from "@/contexts/OneInchTokensContext";

export function AppProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiProviderWrapper>
      <ChainProvider>
        <ThemeProvider>
          <OneInchTokensProvider>
          <TokenProvider>
            <UserProvider>
              <PriceStoreProvider>
                {children}
              </PriceStoreProvider>
            </UserProvider>
          </TokenProvider>
          </OneInchTokensProvider>
        </ThemeProvider>
      </ChainProvider>
    </WagmiProviderWrapper>
  );
}
