export default function UserRow({ user, selectedUsers, setSelectedUsers, updateUser }) {
  const isSelected = selectedUsers.some((u) => u.id === user.id);

  return (
    <tr>
      <td>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => {
            setSelectedUsers((prev) =>
              isSelected ? prev.filter((u) => u.id !== user.id) : [...prev, user]
            );
          }}
        />
      </td>

      <td>{user.email || "—"}</td>
      <td>{user.username || "—"}</td>
      <td>{user.wallet_address}</td>
      <td>{Object.keys(user.chain_addresses || {}).length}</td>

      <td>
        <button onClick={() => updateUser(user.id, { is_verified: !user.is_verified })}>
          Toggle Verify
        </button>
      </td>
    </tr>
  );
}