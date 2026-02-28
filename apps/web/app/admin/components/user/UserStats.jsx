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
    <div className="user-stats">
      <span>👥 Total: {stats.total}</span>
      <span>✅ Verified: {stats.verified}</span>
      <span>📧 With Email: {stats.withEmail}</span>
      <span>🔗 Total Chains: {stats.totalChains}</span>
    </div>
  );
}