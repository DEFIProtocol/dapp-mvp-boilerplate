const API_BASE = (process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '') + '/api';

export interface Holding {
  address: string;
  balance: string;
  symbol?: string;
  name?: string;
  decimals?: number;
}

export interface HoldingsResponse {
  nativeBalance?: {
    balance: string;
    symbol: string;
    decimals: number;
  };
  holdings: Holding[];
}

export async function fetchHoldings(
  address: string,
  chainId: string | number,
  signal?: AbortSignal
): Promise<HoldingsResponse> {
  const response = await fetch(
    `${API_BASE}/infura/holdings?address=${address}&chainId=${chainId}`,
    { signal }
  );
  
  if (!response.ok) {
    let message = 'Failed to fetch holdings';
    try {
      const error = await response.json();
      message = error.error || message;
    } catch {
      message = response.statusText || message;
    }
    throw new Error(message);
  }
  
  return response.json();
}