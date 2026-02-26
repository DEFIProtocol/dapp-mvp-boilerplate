"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";

interface WatchlistProps {
  watchlist: string[];
  tokens: any[];
  selectedChain: number;
}

export function Watchlist({ watchlist, tokens, selectedChain }: WatchlistProps) {
  const router = useRouter();

  const watchlistTokens = tokens.filter(token => 
    watchlist.includes(token.uuid || token.symbol)
  );

  if (watchlistTokens.length === 0) {
    return (
      <div className="rounded-xl p-6 bg-[var(--surface)] border border-[var(--border)]">
        <h2 className="text-xl font-semibold text-[var(--text)] mb-4">
          Watchlist
        </h2>
        <p className="text-[var(--text-muted)]">
          No tokens in watchlist yet. Add tokens from the markets page.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl p-6 bg-[var(--surface)] border border-[var(--border)]">
      <h2 className="text-xl font-semibold text-[var(--text)] mb-4">
        Watchlist
      </h2>

      <div className="flex flex-col gap-3">
        {watchlistTokens.map((token) => (
          <div
            key={token.uuid || token.symbol}
            className="flex items-center justify-between p-4 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] hover:bg-[var(--surface)] transition cursor-pointer"
            onClick={() => {
              router.push(`/${token.name}/${token.uuid}?chain=${selectedChain}`);
            }}
          >
            <div className="flex items-center gap-3">
              {token.image && (
                <Image
                  src={token.image}
                  alt={token.symbol}
                  width={32}
                  height={32}
                  className="rounded-full"
                />
              )}
              <div>
                <p className="text-[var(--text)] font-medium">{token.name}</p>
                <p className="text-[var(--text-muted)] text-sm">{token.symbol}</p>
              </div>
            </div>

            <div className="text-right">
              <p className="text-[var(--text)] font-medium">
                {token.price ? `$${token.price}` : '—'}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}