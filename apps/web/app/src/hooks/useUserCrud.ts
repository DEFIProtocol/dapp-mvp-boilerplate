"use client";

export interface User {
  id: string | number;
  [key: string]: any;
}

import { API_BASE } from "@/lib/api/users";

export function useUserCrud() {
  const createUser = async (data: Partial<User>): Promise<any> => {
    const res = await fetch(`${API_BASE}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return res.json();
  };

  const updateUser = async (id: string | number, data: Partial<User>): Promise<any> => {
    const res = await fetch(`${API_BASE}/users/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return res.json();
  };

  const deleteUser = async (id: string | number): Promise<any> => {
    const res = await fetch(`${API_BASE}/users/${id}`, {
      method: "DELETE",
    });
    return res.json();
  };

  return { createUser, updateUser, deleteUser };
}