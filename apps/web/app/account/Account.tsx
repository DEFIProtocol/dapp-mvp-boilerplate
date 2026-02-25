"use client";

import { useEffect, useState } from "react";
import { fetchHoldings } from "../../src/lib/api";
import { useAccount } from "wagmi";

export function Account() {
  const { address } = useAccount();
  const [loading, setLoading] = useState(false);
  const [nativeBalance, setNativeBalance] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const chainId = "1"; // You will replace this with your ChainContext later

  useEffect(() => {
    if (!address) return;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await fetchHoldings(address, chainId);
        setNativeBalance(data.nativeBalance?.balance || null);
        setHoldings(data.holdings || []);
      } catch (err: any) {
        setError(err.message || "Failed to load holdings");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [address, chainId]);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-[var(--text)]">Account</h1>

        <button
          className="px-4 py-2 rounded-lg bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--surface)] transition"
        >
          Settings
        </button>
      </div>

      {/* Wallet Summary */}
      <div className="rounded-xl p-6 bg-[var(--surface)] border border-[var(--border)]">
        <h2 className="text-lg font-medium text-[var(--text-muted)] mb-2">
          Wallet Address
        </h2>
        <p className="font-mono text-[var(--text)] break-all">
          {address || "Not connected"}
        </p>

        <div className="mt-6">
          <h2 className="text-lg font-medium text-[var(--text-muted)] mb-1">
            Native Balance
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

      {/* Holdings */}
      <div className="rounded-xl p-6 bg-[var(--surface)] border border-[var(--border)]">
        <h2 className="text-xl font-semibold text-[var(--text)] mb-4">
          Token Holdings
        </h2>

        {error && (
          <p className="text-red-400 mb-4">{error}</p>
        )}

        {loading && (
          <p className="text-[var(--text-muted)]">Loading holdings...</p>
        )}

        {!loading && holdings.length === 0 && (
          <p className="text-[var(--text-muted)]">No tokens found</p>
        )}

        <div className="flex flex-col gap-3">
          {holdings.map((item) => (
            <div
              key={item.address}
              className="flex items-center justify-between p-4 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]"
            >
              <div>
                <p className="text-[var(--text)] font-medium">{item.symbol}</p>
                <p className="text-[var(--text-muted)] text-sm">
                  {item.address}
                </p>
              </div>

              <p className="text-[var(--text)] font-semibold">
                {item.balance}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}