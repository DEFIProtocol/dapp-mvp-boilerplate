"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { useAccount } from "wagmi";
import { getUserByWallet, createUser, User } from "../lib/api/users";

interface UserContextType {
  user: User | null;
  loading: boolean;
  watchlist: string[];
  refreshUser: () => Promise<void>;
  createUser: () => Promise<void>;
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
      const userData = await createUser(address);
      setUser(userData);
    } catch (error) {
      console.error('Error creating user:', error);
    } finally {
      setLoading(false);
    }
  }, [address, isConnected]);

  return (
    <UserContext.Provider
      value={{
        user,
        loading,
        watchlist: user?.watchlist || [],
        refreshUser,
        createUser: handleCreateUser,
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