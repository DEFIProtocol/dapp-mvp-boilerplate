// user/UserTable.jsx
import UserRow from "./UserRow";
import styles from './UserTable.module.css';

export default function UserTable({
  users,
  selectedUsers,
  setSelectedUsers,
  sortConfig,
  setSortConfig,
  updateUser,
}) {
  const handleSort = (key) => {
    setSortConfig({
      key,
      direction: sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc'
    });
  };

  const getSortIndicator = (key) => {
    if (sortConfig.key !== key) return '↕️';
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

  const toggleAll = () => {
    if (selectedUsers.length === users.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers([...users]);
    }
  };

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.userTable}>
        <thead>
          <tr>
            <th className={styles.checkboxCol}>
              <input
                type="checkbox"
                onChange={toggleAll}
                checked={selectedUsers.length === users.length && users.length > 0}
              />
            </th>
            <th onClick={() => handleSort('email')} className={styles.sortable}>
              Email {getSortIndicator('email')}
            </th>
            <th onClick={() => handleSort('username')} className={styles.sortable}>
              Username {getSortIndicator('username')}
            </th>
            <th onClick={() => handleSort('wallet_address')} className={styles.sortable}>
              Wallet Address {getSortIndicator('wallet_address')}
            </th>
            <th>Chains</th>
            <th>Verified</th>
            <th className={styles.actionsCol}>Actions</th>
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
          {users.length === 0 && (
            <tr>
              <td colSpan="7" className={styles.noResults}>
                No users found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}