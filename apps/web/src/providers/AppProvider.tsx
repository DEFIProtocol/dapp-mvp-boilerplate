"use client";

import { ReactNode } from "react";
import { WagmiProviderWrapper } from "./wagmi";
import  ChainProvider  from "../contexts/ChainContext";
import ThemeProvider from "../contexts/ThemeContext";
// import { ThemeProvider } from "../contexts/ThemeContext";
// import { UserProvider } from "../contexts/UserContext";

export function AppProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiProviderWrapper>
      <ChainProvider>
        {/* Add more providers here as your app grows */}
        <ThemeProvider>
        {/* <UserProvider> */}
        {children}
        {/* </UserProvider> */}
        </ThemeProvider>
      </ChainProvider>
    </WagmiProviderWrapper>
  );
}