// user/UserStats.jsx
import styles from './UserTable.module.css';

export default function UserStats({ users }) {
  const stats = {
    total: users.length,
    verified: users.filter((u) => u.is_verified_by_coinbase).length,
    withEmail: users.filter((u) => u.email).length,
    totalChains: users.reduce(
      (acc, u) => acc + Object.keys(u.chain_addresses || {}).length,
      0
    ),
  };

  return (
    <div className={styles.userStats}>
      <div className={styles.statCard}>
        <div className={styles.statLabel}>Total Users</div>
        <div className={styles.statValue}>{stats.total}</div>
      </div>
      <div className={styles.statCard}>
        <div className={styles.statLabel}>Verified</div>
        <div className={styles.statValue}>{stats.verified}</div>
      </div>
      <div className={styles.statCard}>
        <div className={styles.statLabel}>With Email</div>
        <div className={styles.statValue}>{stats.withEmail}</div>
      </div>
      <div className={styles.statCard}>
        <div className={styles.statLabel}>Chain Addresses</div>
        <div className={styles.statValue}>{stats.totalChains}</div>
      </div>
    </div>
  );
}