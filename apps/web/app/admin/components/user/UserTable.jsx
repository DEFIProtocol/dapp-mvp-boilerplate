import UserRow from "./UserRow";

export default function UserTable({
  users,
  selectedUsers,
  setSelectedUsers,
  sortConfig,
  setSortConfig,
  updateUser,
}) {
  return (
    <table className="user-table">
      <thead>
        <tr>
          <th>Select</th>
          <th onClick={() => setSortConfig({ key: "email", direction: "asc" })}>Email</th>
          <th>Username</th>
          <th>Wallet</th>
          <th>Chains</th>
          <th>Actions</th>
        </tr>
      </thead>

      <tbody>
        {users.map((u) => (
          <UserRow
            key={u.id}
            user={u}
            selectedUsers={selectedUsers}
            setSelectedUsers={setSelectedUsers}
            updateUser={updateUser}
          />
        ))}
      </tbody>
    </table>
  );
}