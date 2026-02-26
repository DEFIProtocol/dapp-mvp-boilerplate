"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useRouter } from "next/navigation";
import { Settings } from "lucide-react";

import { fetchHoldings } from "../../src/lib/api/holdings"; // Adjust based on your actual import path
import { useChainContext } from "../../src/contexts/ChainContext";
import { useUser } from "../../src/contexts/UserContext"; // Note: useUser, not UserProvider here
import { useTokens } from "../../src/contexts/TokenContext";
import { WalletBalance } from "./components/WalletBalance";
import { Holdings } from "./components/Holdings";
import { Watchlist } from "./components/Watchlist";

export default function AccountPage() {
  const { address } = useAccount();
  const router = useRouter();
  const { selectedChain, getChainLabel } = useChainContext();
  const { user, watchlist } = useUser(); // Get user data
  const { tokens } = useTokens(); // Get token data
  
  const [loading, setLoading] = useState(false);
  const [nativeBalance, setNativeBalance] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [totalValue, setTotalValue] = useState<string>("0.00");

  // Fetch holdings
  useEffect(() => {
    if (!address) return;

    const loadHoldings = async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await fetchHoldings(address, selectedChain);
        setNativeBalance(data.nativeBalance?.balance || null);
        setHoldings(data.holdings || []);
        
        // Calculate total value if we have prices
        // This will be enhanced when you add price data
      } catch (err: any) {
        setError(err.message || "Failed to load holdings");
      } finally {
        setLoading(false);
      }
    };

    loadHoldings();
  }, [address, selectedChain]);

  if (!address) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <h1 className="text-2xl font-semibold text-[var(--text)] mb-4">
          Connect Your Wallet
        </h1>
        <p className="text-[var(--text-muted)] text-center max-w-md">
          Please connect your wallet to view your account details and token holdings.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-[var(--text)]">Account</h1>
          <p className="text-[var(--text-muted)] text-sm mt-1">
            Connected to {getChainLabel(selectedChain)}
          </p>
        </div>

        <button
          onClick={() => router.push("/account/settings")}
          className="p-3 rounded-lg bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--surface)] transition"
          aria-label="Account settings"
        >
          <Settings size={20} />
        </button>
      </div>

      {/* Wallet Balance */}
      <WalletBalance
        address={address}
        nativeBalance={nativeBalance}
        loading={loading}
        chainLabel={getChainLabel(selectedChain)}
      />

      {/* Holdings */}
      <Holdings
        holdings={holdings}
        tokens={tokens}
        loading={loading}
        error={error}
        selectedChain={selectedChain}
      />

      {/* Watchlist */}
      <Watchlist
        watchlist={watchlist}
        tokens={tokens}
        selectedChain={selectedChain}
      />
    </div>
  );
}