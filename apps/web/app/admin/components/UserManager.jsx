"use client";

import { useState, useMemo } from "react";
import { useAllUserContext } from "@/contexts/AllUserContext";
import { useUserCrud } from "@/hooks/useUserCrud";
import UserStats from "./user/UserStats";
import UserTable from "./user/UserTable";
import UserActions from "./user/UserActions";

export default function UserManager() {
  const { users, loading, error, refreshUsers } = useAllUserContext();
  const { createUser, updateUser, deleteUser } = useUserCrud();

  const [search, setSearch] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: "created_at", direction: "desc" });
  const [selectedUsers, setSelectedUsers] = useState([]);

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    const term = search.toLowerCase();

    return users
      .filter((u) =>
        [u.email, u.username, u.wallet_address, u.id]
          .filter(Boolean)
          .some((v) => v.toLowerCase().includes(term))
      )
      .sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        return sortConfig.direction === "asc"
          ? aVal > bVal ? 1 : -1
          : aVal < bVal ? 1 : -1;
      });
  }, [users, search, sortConfig]);

  return (
    <div className="admin-user-manager">
      <UserActions
        selectedUsers={selectedUsers}
        deleteUser={deleteUser}
        refreshUsers={refreshUsers}
      />

      <UserStats users={users} />

      <UserTable
        users={filteredUsers}
        selectedUsers={selectedUsers}
        setSelectedUsers={setSelectedUsers}
        sortConfig={sortConfig}
        setSortConfig={setSortConfig}
        updateUser={updateUser}
      />
    </div>
  );
}