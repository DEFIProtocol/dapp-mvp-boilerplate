const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api';

export interface User {
  id: string;
  wallet_address: string;
  email?: string;
  username?: string;
  chain_addresses?: Record<string, any>;
  watchlist?: string[];
  is_verified_by_coinbase?: boolean;
  created_at?: string;
  updated_at?: string;
}

const unwrapUser = (payload: any): User | null => {
  if (!payload) return null;
  if (payload.data) return payload.data as User;
  if (payload.wallet_address) return payload as User;
  return null;
};

// Update user by wallet address
export async function updateUserByWallet(
  wallet_address: string,
  data: Partial<User>
): Promise<User | null> {
  try {
    const response = await fetch(`${API_BASE}/users/wallet/${wallet_address}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to update user');
    const resData = await response.json();
    return unwrapUser(resData);
  } catch (error) {
    console.error('Error updating user by wallet:', error);
    return null;
  }
}

export async function getUserByWallet(address: string): Promise<User | null> {
  try {
    const response = await fetch(`${API_BASE}/users/wallet/${address}`);
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error('Failed to fetch user');
    }
    const data = await response.json();
    return unwrapUser(data);
  } catch (error) {
    console.error('Error fetching user:', error);
    return null;
  }
}

export async function createUser(wallet_address: string): Promise<User | null> {
  try {
    const response = await fetch(`${API_BASE}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet_address }),
    });
    if (!response.ok) throw new Error('Failed to create user');
    const data = await response.json();
    return unwrapUser(data);
  } catch (error) {
    console.error('Error creating user:', error);
    return null;
  }
}

export async function updateUserWatchlist(
  wallet_address: string,
  watchlist: string[]
): Promise<User | null> {
  try {
    const response = await fetch(`${API_BASE}/users/wallet/${wallet_address}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ watchlist }),
    });
    if (!response.ok) throw new Error('Failed to update watchlist');
    const data = await response.json();
    return unwrapUser(data);
  } catch (error) {
    console.error('Error updating watchlist:', error);
    return null;
  }
}

export async function addToWatchlist(
  wallet_address: string,
  tokenSymbol: string
): Promise<User | null> {
  try {
    const response = await fetch(`${API_BASE}/users/watchlist/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet_address, tokenSymbol }),
    });
    if (!response.ok) {
      const raw = await response.text();
      let message = `Failed to add to watchlist (${response.status})`;
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed?.error) message = `${message}: ${parsed.error}`;
          else if (parsed?.message) message = `${message}: ${parsed.message}`;
          else message = `${message}: ${raw}`;
        } catch {
          message = `${message}: ${raw}`;
        }
      }
      throw new Error(message);
    }
    const data = await response.json();
    return unwrapUser(data);
  } catch (error) {
    console.error('Error adding to watchlist:', error);
    return null;
  }
}

export async function removeFromWatchlist(
  wallet_address: string,
  tokenSymbol: string
): Promise<User | null> {
  try {
    const response = await fetch(`${API_BASE}/users/watchlist/remove`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet_address, tokenSymbol }),
    });
    if (!response.ok) {
      const raw = await response.text();
      let message = `Failed to remove from watchlist (${response.status})`;
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed?.error) message = `${message}: ${parsed.error}`;
          else if (parsed?.message) message = `${message}: ${parsed.message}`;
          else message = `${message}: ${raw}`;
        } catch {
          message = `${message}: ${raw}`;
        }
      }
      throw new Error(message);
    }
    const data = await response.json();
    return unwrapUser(data);
  } catch (error) {
    console.error('Error removing from watchlist:', error);
    return null;
  }
}