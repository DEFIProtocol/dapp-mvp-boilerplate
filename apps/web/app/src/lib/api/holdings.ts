const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api';

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
  chainId: string | number
): Promise<HoldingsResponse> {
  const response = await fetch(
    `${API_BASE}/infura/holdings?address=${address}&chainId=${chainId}`
  );
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch holdings');
  }
  
  return response.json();
}