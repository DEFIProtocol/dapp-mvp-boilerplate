"use client";

import { useState, useMemo } from "react";
import { useAllUserContext } from "@/contexts/AllUserContext";
import { useUserCrud } from "@/hooks/useUserCrud";
import UserStats from "./user/UserStats";
import UserTable from "./user/UserTable";
import UserActions from "./user/UserActions";
import styles from "./styles/UserManager.module.css";

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

  if (loading && !users.length) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingSpinner}></div>
        <div className={styles.loadingText}>Loading users...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorState}>
        <h3>⚠️ Error Loading Users</h3>
        <p>{error}</p>
        <button onClick={refreshUsers} className={styles.retryButton}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={styles.userManager}>
      {/* Header Stats */}
      <UserStats users={users} />

      {/* Search Bar */}
      <div className={styles.searchBar}>
        <input
          type="text"
          placeholder="Search users by email, username, wallet..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={styles.searchInput}
        />
      </div>

      {/* Action Bar */}
      <UserActions
        selectedUsers={selectedUsers}
        deleteUser={deleteUser}
        refreshUsers={refreshUsers}
      />

      {/* Users Table */}
      <div className={styles.tableSection}>
        <UserTable
          users={filteredUsers}
          selectedUsers={selectedUsers}
          setSelectedUsers={setSelectedUsers}
          sortConfig={sortConfig}
          setSortConfig={setSortConfig}
          updateUser={updateUser}
        />
      </div>
    </div>
  );
}