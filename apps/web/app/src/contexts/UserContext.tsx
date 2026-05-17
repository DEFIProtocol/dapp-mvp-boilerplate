"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { useAccount } from "wagmi";
import { getUserByWallet, createUser, isValidAddress, User, addToWatchlist, removeFromWatchlist } from "../lib/api/users";

interface UserContextType {
  user: User | null;
  loading: boolean;
  watchlist: string[];
  refreshUser: () => Promise<void>;
  createUser: () => Promise<void>;
  isInWatchlist: (token: { symbol?: string } | string) => boolean;
  toggleWatchlistToken: (token: { symbol?: string } | string) => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const { address, isConnected } = useAccount();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Only fetch user when we have a connected wallet
  useEffect(() => {
    if (!isConnected || !address) {
      setUser(null);
      setLoading(false);
      return;
    }

    const fetchUser = async () => {
      try {
        setLoading(true);
        if (!isValidAddress(address)) {
          console.error('Invalid wallet address from connector:', address);
          setUser(null);
          return;
        }

        console.log('👤 Fetching user for wallet:', address);
        const userData = await getUserByWallet(address);
        setUser(userData);
      } catch (error) {
        console.error('❌ Error in user fetch:', error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [address, isConnected]);

  const refreshUser = useCallback(async () => {
    if (!address || !isConnected) return;
    
    try {
      const userData = await getUserByWallet(address);
      setUser(userData);
    } catch (error) {
      console.error('Error refreshing user:', error);
    }
  }, [address, isConnected]);

  // Expose createUser for manual invocation
  const handleCreateUser = useCallback(async () => {
    if (!address || !isConnected) return;
    if (!isValidAddress(address)) {
      console.error('Invalid wallet address when creating user:', address);
      return;
    }
    try {
      setLoading(true);
      // Check if user already exists
      const existingUser = await getUserByWallet(address);
      if (existingUser) {
        setUser(existingUser);
        return;
      }
      // Only create if not found
      const userData = await createUser(address);
      setUser(userData);
    } catch (error) {
      console.error('Error creating user:', error);
    } finally {
      setLoading(false);
    }
  }, [address, isConnected]);

  const getWatchlistSymbols = useCallback((): string[] => {
    const rawList = Array.isArray(user?.watchlist) ? user!.watchlist : [];

    return rawList
      .map((item: any) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && typeof item.symbol === "string") return item.symbol;
        return "";
      })
      .map((symbol) => String(symbol).trim().toUpperCase())
      .filter(Boolean);
  }, [user?.watchlist]);

  const isInWatchlist = useCallback((token: { symbol?: string } | string) => {
    const symbol = typeof token === "string" ? token : token?.symbol;
    if (!symbol) return false;
    const target = String(symbol).toUpperCase();
    return getWatchlistSymbols().some((item) => item === target);
  }, [getWatchlistSymbols]);

  const toggleWatchlistToken = useCallback(async (token: { symbol?: string } | string) => {
    if (!address || !isConnected) return;
    const symbol = (typeof token === "string" ? token : token?.symbol || "").toUpperCase();
    if (!symbol) return;

    try {
      let ensuredUser = user;
      if (!ensuredUser) {
        const existingUser = await getUserByWallet(address);
        if (existingUser) {
          ensuredUser = existingUser;
          setUser(existingUser);
        } else {
          const createdUser = await createUser(address);
          if (createdUser) {
            ensuredUser = createdUser;
            setUser(createdUser);
          }
        }
      }

      if (!ensuredUser) {
        console.error("Unable to ensure user before watchlist toggle");
        return;
      }

      let updatedUser: User | null = null;
      if (isInWatchlist(symbol)) {
        updatedUser = await removeFromWatchlist(address, symbol);
      } else {
        updatedUser = await addToWatchlist(address, symbol);
      }

      if (updatedUser) {
        setUser(updatedUser);
      } else {
        await refreshUser();
      }
    } catch (error) {
      console.error("Error toggling watchlist token:", error);
    }
  }, [address, isConnected, isInWatchlist, refreshUser, user]);

  return (
    <UserContext.Provider
      value={{
        user,
        loading,
        watchlist: getWatchlistSymbols(),
        refreshUser,
        createUser: handleCreateUser,
        isInWatchlist,
        toggleWatchlistToken,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}

export function useUserContext() {
  return useUser();
}