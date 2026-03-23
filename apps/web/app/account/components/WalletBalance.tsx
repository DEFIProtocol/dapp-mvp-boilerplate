"use client";

interface WalletBalanceProps {
  address: string;
  nativeBalance: string | null;
  loading: boolean;
  chainLabel: string;
}

export function WalletBalance({ 
  address, 
  nativeBalance, 
  loading, 
  chainLabel 
}: WalletBalanceProps) {
  return (
    <div className="rounded-2xl p-6 bg-[var(--card-bg)] backdrop-blur-[20px] border border-[var(--glass-border)] shadow-[var(--card-shadow)]">
      <h2 className="text-lg font-medium text-[var(--text-muted)] mb-2">
        Wallet Address
      </h2>
      <p className="font-mono text-[var(--text)] break-all text-sm">
        {address}
      </p>

      <div className="mt-6">
        <h2 className="text-lg font-medium text-[var(--text-muted)] mb-1">
          Native Balance on {chainLabel}
        </h2>

        {loading ? (
          <p className="text-[var(--text-muted)]">Loading...</p>
        ) : (
          <p className="text-2xl font-semibold text-[var(--text)]">
            {nativeBalance ? `${nativeBalance} ETH` : "—"}
          </p>
        )}
      </div>
    </div>
  );
}