"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";

interface Holding {
  address: string;
  balance: string;
  symbol?: string;
  name?: string;
}

interface HoldingsProps {
  holdings: Holding[];
  tokens: any[];
  loading: boolean;
  error?: string | null;
  selectedChain: number;
}

export function Holdings({ 
  holdings, 
  tokens, 
  loading, 
  error, 
  selectedChain 
}: HoldingsProps) {
  const router = useRouter();

  // Enrich holdings with token data
  const enrichedHoldings = holdings.map((holding) => {
    // Find matching token by address (simplified - you'll need better matching logic)
    const token = tokens.find(t => 
      t.addresses?.[String(selectedChain)]?.toLowerCase() === holding.address.toLowerCase()
    );
    
    return {
      ...holding,
      token,
      image: token?.image,
      name: token?.name || holding.symbol || "Unknown",
      symbol: token?.symbol || holding.symbol || "???",
    };
  });

  if (!holdings.length && !loading) {
    return (
      <div className="rounded-xl p-6 bg-[var(--surface)] border border-[var(--border)]">
        <h2 className="text-xl font-semibold text-[var(--text)] mb-4">
          Token Holdings
        </h2>
        <p className="text-[var(--text-muted)]">No tokens found</p>
      </div>
    );
  }

  return (
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

      <div className="flex flex-col gap-3">
        {enrichedHoldings.map((item) => (
          <div
            key={item.address}
            className="flex items-center justify-between p-4 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] hover:bg-[var(--surface)] transition cursor-pointer"
            onClick={() => {
              if (item.token?.uuid) {
                router.push(`/${item.token.name}/${item.token.uuid}?chain=${selectedChain}`);
              }
            }}
          >
            <div className="flex items-center gap-3">
              {item.image && (
                <Image
                  src={item.image}
                  alt={item.symbol}
                  width={32}
                  height={32}
                  className="rounded-full"
                />
              )}
              <div>
                <p className="text-[var(--text)] font-medium">{item.name}</p>
                <p className="text-[var(--text-muted)] text-xs font-mono">
                  {item.address.slice(0, 6)}...{item.address.slice(-4)}
                </p>
              </div>
            </div>

            <p className="text-[var(--text)] font-semibold">
              {Number(item.balance).toFixed(4)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}