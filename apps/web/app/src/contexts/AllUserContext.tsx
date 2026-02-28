
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
      const res = await fetch("/api/users");
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to fetch users");
      setUsers(json.data || []);
    } catch (err: any) {
      setError(err.message);
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