// user/UserActions.jsx
import styles from './UserTable.module.css';

export default function UserActions({ selectedUsers, deleteUser, refreshUsers }) {
  return (
    <div className={styles.actionBar}>
      <button
        onClick={refreshUsers}
        className={`${styles.actionBtn} ${styles.info}`}
        title="Refresh users"
      >
        <span className={styles.btnIcon}>🔄</span>
        Refresh
      </button>

      {selectedUsers.length > 0 && (
        <button
          className={`${styles.actionBtn} ${styles.danger}`}
          onClick={() => {
            if (!confirm(`Delete ${selectedUsers.length} user(s)?`)) return;
            selectedUsers.forEach((u) => deleteUser(u.id));
          }}
        >
          <span className={styles.btnIcon}>🗑️</span>
          Delete ({selectedUsers.length})
        </button>
      )}
    </div>
  );
}