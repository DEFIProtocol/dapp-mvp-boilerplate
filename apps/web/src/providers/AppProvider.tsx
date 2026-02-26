"use client";

import { ReactNode } from "react";
import { WagmiProviderWrapper } from "./wagmi";
import ChainProvider from "../contexts/ChainContext";
import ThemeProvider from "../contexts/ThemeContext";
import { UserProvider } from "../contexts/UserContext";
import { TokenProvider } from "../contexts/TokenContext";

export function AppProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiProviderWrapper>
      <ChainProvider>
        <ThemeProvider>
          <TokenProvider>
            <UserProvider>
              {children}
            </UserProvider>
          </TokenProvider>
        </ThemeProvider>
      </ChainProvider>
    </WagmiProviderWrapper>
  );
}