export default function UserActions({ selectedUsers, deleteUser, refreshUsers }) {
  return (
    <div className="user-actions">
      <button onClick={refreshUsers}>🔄 Refresh</button>

      {selectedUsers.length > 0 && (
        <button
          className="danger"
          onClick={() => {
            if (!confirm(`Delete ${selectedUsers.length} users?`)) return;
            selectedUsers.forEach((u) => deleteUser(u.id));
          }}
        >
          🗑️ Delete Selected ({selectedUsers.length})
        </button>
      )}
    </div>
  );
}