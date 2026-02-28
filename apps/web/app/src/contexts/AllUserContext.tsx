"use client";
import React, { ReactNode, Dispatch, SetStateAction, useState, useEffect, useCallback, createContext, useContext } from "react";

export interface User {
  id: string | number;
  [key: string]: any;
}

interface AllUserContextType {
  users: User[];
  loading: boolean;
  error: string | null;
  selectedUser: User | null;
  setSelectedUser: Dispatch<SetStateAction<User | null>>;
  refreshUsers: () => Promise<void>;
}

const AllUserContext = createContext<AllUserContextType | undefined>(undefined);

export function AllUserProvider({ children }: { children: ReactNode }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fix: Use the correct endpoint path
      const res = await fetch("/api/users/db");
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      
      const data = await res.json();
      
      // Your backend returns the array directly, not wrapped in { success, data }
      if (Array.isArray(data)) {
        setUsers(data);
      } else if (data.error) {
        throw new Error(data.error);
      } else {
        // Fallback: if it's wrapped in some other format
        setUsers(data.data || data.users || []);
      }
    } catch (err: any) {
      console.error('Error fetching users:', err);
      setError(err.message);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  return (
    <AllUserContext.Provider
      value={{
        users,
        loading,
        error,
        selectedUser,
        setSelectedUser,
        refreshUsers: fetchUsers,
      }}
    >
      {children}
    </AllUserContext.Provider>
  );
}

export function useAllUserContext() {
  const ctx = useContext(AllUserContext);
  if (!ctx) throw new Error("useAllUserContext must be used inside <AllUserProvider>");
  return ctx;
}