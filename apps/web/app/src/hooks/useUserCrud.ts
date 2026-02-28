"use client";

export interface User {
  id: string | number;
  [key: string]: any;
}

export function useUserCrud() {
  const createUser = async (data: Partial<User>): Promise<any> => {
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return res.json();
  };

  const updateUser = async (id: string | number, data: Partial<User>): Promise<any> => {
    const res = await fetch(`/api/users/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return res.json();
  };

  const deleteUser = async (id: string | number): Promise<any> => {
    const res = await fetch(`/api/users/${id}`, {
      method: "DELETE",
    });
    return res.json();
  };

  return { createUser, updateUser, deleteUser };
}