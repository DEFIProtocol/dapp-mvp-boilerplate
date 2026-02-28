// user/UserRow.jsx
import { useState } from 'react';
import styles from './UserTable.module.css';

export default function UserRow({ user, selectedUsers, setSelectedUsers, updateUser }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({ username: user.username, email: user.email });
  const isSelected = selectedUsers.some((u) => u.id === user.id);
  const chainCount = Object.keys(user.chain_addresses || {}).length;

  const handleUpdate = async () => {
    await updateUser(user.id, editData);
    setIsEditing(false);
  };

  const truncateWallet = (wallet) => {
    if (!wallet) return '—';
    return `${wallet.substring(0, 6)}...${wallet.substring(wallet.length - 4)}`;
  };

  return (
    <tr className={`${styles.userRow} ${isSelected ? styles.selected : ''}`}>
      <td className={styles.checkboxCol}>
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

      <td className={styles.emailCell}>
        {isEditing ? (
          <input
            type="email"
            value={editData.email || ''}
            onChange={(e) => setEditData({ ...editData, email: e.target.value })}
            className={styles.editInput}
            placeholder="Email"
          />
        ) : (
          user.email || <span className={styles.placeholder}>—</span>
        )}
      </td>

      <td className={styles.usernameCell}>
        {isEditing ? (
          <input
            type="text"
            value={editData.username || ''}
            onChange={(e) => setEditData({ ...editData, username: e.target.value })}
            className={styles.editInput}
            placeholder="Username"
          />
        ) : (
          user.username || <span className={styles.placeholder}>—</span>
        )}
      </td>

      <td className={styles.walletCell} title={user.wallet_address}>
        {truncateWallet(user.wallet_address)}
      </td>

      <td className={styles.chainsCell}>
        {chainCount > 0 ? (
          <span className={styles.chainBadge}>{chainCount}</span>
        ) : (
          <span className={styles.placeholder}>0</span>
        )}
      </td>

      <td className={styles.verifiedCell}>
        {user.is_verified_by_coinbase ? (
          <span className={styles.verifiedBadge} title="Verified by Coinbase">✅</span>
        ) : (
          <span className={styles.unverifiedBadge} title="Not verified">❌</span>
        )}
      </td>

      <td className={styles.actionsCell}>
        {isEditing ? (
          <>
            <button
              onClick={handleUpdate}
              className={`${styles.actionBtn} ${styles.success} ${styles.small}`}
              title="Save"
            >
              💾
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className={`${styles.actionBtn} ${styles.secondary} ${styles.small}`}
              title="Cancel"
            >
              ✕
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setIsEditing(true)}
              className={`${styles.actionBtn} ${styles.info} ${styles.small}`}
              title="Edit user"
            >
              ✎
            </button>
            <button
              onClick={() => updateUser(user.id, { is_verified_by_coinbase: !user.is_verified_by_coinbase })}
              className={`${styles.actionBtn} ${styles.primary} ${styles.small}`}
              title="Toggle verification"
            >
              ✓
            </button>
          </>
        )}
      </td>
    </tr>
  );
}