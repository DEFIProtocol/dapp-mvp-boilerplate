"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { useAccount } from "wagmi";
import { getUserByWallet, createUser, User, addToWatchlist, removeFromWatchlist } from "../lib/api/users";

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

  const isInWatchlist = useCallback((token: { symbol?: string } | string) => {
    const symbol = typeof token === "string" ? token : token?.symbol;
    if (!symbol) return false;
    return (user?.watchlist || []).some((item) => String(item).toUpperCase() === String(symbol).toUpperCase());
  }, [user?.watchlist]);

  const toggleWatchlistToken = useCallback(async (token: { symbol?: string } | string) => {
    if (!address || !isConnected) return;
    const symbol = (typeof token === "string" ? token : token?.symbol || "").toUpperCase();
    if (!symbol) return;

    try {
      if (isInWatchlist(symbol)) {
        await removeFromWatchlist(address, symbol);
      } else {
        await addToWatchlist(address, symbol);
      }
      await refreshUser();
    } catch (error) {
      console.error("Error toggling watchlist token:", error);
    }
  }, [address, isConnected, isInWatchlist, refreshUser]);

  return (
    <UserContext.Provider
      value={{
        user,
        loading,
        watchlist: user?.watchlist || [],
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