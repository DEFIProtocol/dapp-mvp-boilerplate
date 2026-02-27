const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api';

export interface Token {
  id?: number;
  symbol: string;
  name: string;
  price?: number;
  market_cap?: number;
  volume_24h?: number;
  decimals?: number;
  type?: string;
  image?: string;
  uuid?: string;
  addresses?: Record<string, string>;
  chains?: Record<string, any>;
}

export async function getAllTokens(): Promise<Token[]> {
  try {
    const response = await fetch(`${API_BASE}/tokens/db`);
    if (!response.ok) throw new Error('Failed to fetch tokens');
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error('Error fetching tokens:', error);
    return [];
  }
}

export async function getTokenBySymbol(symbol: string): Promise<Token | null> {
  try {
    const response = await fetch(`${API_BASE}/tokens/db/${symbol}`);
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error('Failed to fetch token');
    }
    const data = await response.json();
    return data.data;
  } catch (error) {
    console.error('Error fetching token:', error);
    return null;
  }
}