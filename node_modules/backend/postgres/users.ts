import { Pool } from "pg";

export interface UserRow {
  id?: string;
  wallet_address: string;
  email?: string;
  username?: string;
  chain_addresses?: any;
  watchlist?: any;
  is_verified_by_coinbase?: boolean;
  created_at?: string;
  updated_at?: string;
}

// Cache for table readiness
let tableReady = false;

/**
 * Normalize wallet address to lowercase
 */
export function normalizeAddress(value: string): string {
  if (!value) return '';
  return value.toString().trim().toLowerCase();
}

/**
 * Validate Ethereum address format
 */
export function isValidEthAddress(value: string): boolean {
  return /^0x[a-f0-9]{40}$/i.test(value || '');
}

/**
 * Normalize JSONB data
 */
export function normalizeJsonb(value: any): string | null {
  if (value === undefined || value === null) return null;
  
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return JSON.stringify(parsed);
    } catch (error) {
      return null;
    }
  }
  
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (error) {
      return null;
    }
  }
  
  return null;
}

/**
 * Ensure users table exists with all required columns
 */
export async function ensureUsersTable(pool: Pool): Promise<void> {
  if (tableReady) return;

  await pool.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      wallet_address VARCHAR(66) UNIQUE NOT NULL,
      email VARCHAR(255),
      username VARCHAR(50),
      chain_addresses JSONB,
      watchlist JSONB,
      is_verified_by_coinbase BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Add watchlist column if it doesn't exist (for backward compatibility)
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS watchlist JSONB');

  tableReady = true;
}

/**
 * Map database row to UserRow object
 */
export function mapUserRow(row: any): UserRow | null {
  if (!row) return null;
  return {
    id: row.id,
    wallet_address: row.wallet_address,
    email: row.email,
    username: row.username,
    chain_addresses: row.chain_addresses,
    watchlist: row.watchlist,
    is_verified_by_coinbase: row.is_verified_by_coinbase,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

/**
 * Get all users
 */
export async function getAllUsers(pool: Pool): Promise<UserRow[]> {
  await ensureUsersTable(pool);
  const result = await pool.query("SELECT * FROM users ORDER BY created_at DESC");
  return result.rows.map(mapUserRow).filter((user): user is UserRow => user !== null);
}

/**
 * Get user by ID
 */
export async function getUserById(pool: Pool, id: string): Promise<UserRow | null> {
  await ensureUsersTable(pool);
  const result = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
  return mapUserRow(result.rows[0]);
}

/**
 * Get user by wallet address
 */
export async function getUserByWallet(pool: Pool, address: string): Promise<UserRow | null> {
  await ensureUsersTable(pool);
  const walletAddress = normalizeAddress(address);
  const result = await pool.query("SELECT * FROM users WHERE wallet_address = $1", [walletAddress]);
  return mapUserRow(result.rows[0]);
}

/**
 * Create a new user
 */
export async function createUser(pool: Pool, data: Partial<UserRow>): Promise<UserRow | null> {
  await ensureUsersTable(pool);
  
  const { 
    wallet_address, 
    email, 
    username, 
    is_verified_by_coinbase, 
    chain_addresses, 
    watchlist 
  } = data;
  
  const normalizedWallet = normalizeAddress(wallet_address || '');

  if (!normalizedWallet || !isValidEthAddress(normalizedWallet)) {
    throw new Error('Valid wallet_address is required');
  }

  const payload = {
    wallet_address: normalizedWallet,
    email: email || null,
    username: username || null,
    is_verified_by_coinbase: is_verified_by_coinbase === true,
    chain_addresses: normalizeJsonb(chain_addresses),
    watchlist: normalizeJsonb(watchlist)
  };

  try {
    const result = await pool.query(
      `INSERT INTO users (wallet_address, email, username, chain_addresses, watchlist, is_verified_by_coinbase)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
       RETURNING *`,
      [
        payload.wallet_address,
        payload.email,
        payload.username,
        payload.chain_addresses,
        payload.watchlist,
        payload.is_verified_by_coinbase
      ]
    );

    return mapUserRow(result.rows[0]);
  } catch (error) {
    if ((error as any).code === '23505') { // unique_violation
      throw new Error('User already exists');
    }
    throw error;
  }
}

/**
 * Update user by ID
 */
export async function updateUser(
  pool: Pool, 
  id: string, 
  data: Partial<UserRow>
): Promise<UserRow | null> {
  await ensureUsersTable(pool);
  
  const { 
    email, 
    username, 
    is_verified_by_coinbase, 
    chain_addresses, 
    watchlist 
  } = data;

  const result = await pool.query(
    `UPDATE users
     SET email = COALESCE($2, email),
         username = COALESCE($3, username),
         chain_addresses = COALESCE($4::jsonb, chain_addresses),
         watchlist = COALESCE($5::jsonb, watchlist),
         is_verified_by_coinbase = COALESCE($6, is_verified_by_coinbase),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      email ?? null,
      username ?? null,
      normalizeJsonb(chain_addresses),
      normalizeJsonb(watchlist),
      is_verified_by_coinbase
    ]
  );

  return mapUserRow(result.rows[0]);
}

/**
 * Update user by wallet address
 */
export async function updateUserByWallet(
  pool: Pool,
  address: string,
  data: Partial<UserRow>
): Promise<UserRow | null> {
  await ensureUsersTable(pool);
  
  const walletAddress = normalizeAddress(address);
  
  if (!walletAddress || !isValidEthAddress(walletAddress)) {
    throw new Error('Valid wallet_address is required');
  }

  const { 
    email, 
    username, 
    is_verified_by_coinbase, 
    chain_addresses, 
    watchlist 
  } = data;

  const result = await pool.query(
    `UPDATE users
     SET email = COALESCE($2, email),
         username = COALESCE($3, username),
         chain_addresses = COALESCE($4::jsonb, chain_addresses),
         watchlist = COALESCE($5::jsonb, watchlist),
         is_verified_by_coinbase = COALESCE($6, is_verified_by_coinbase),
         updated_at = NOW()
     WHERE wallet_address = $1
     RETURNING *`,
    [
      walletAddress,
      email ?? null,
      username ?? null,
      normalizeJsonb(chain_addresses),
      normalizeJsonb(watchlist),
      is_verified_by_coinbase
    ]
  );

  return mapUserRow(result.rows[0]);
}

/**
 * Delete user by ID
 */
export async function deleteUser(pool: Pool, id: string): Promise<UserRow | null> {
  await ensureUsersTable(pool);
  
  const result = await pool.query(
    "DELETE FROM users WHERE id = $1 RETURNING *",
    [id]
  );
  
  return mapUserRow(result.rows[0]);
}

/**
 * Delete user by wallet address
 */
export async function deleteUserByWallet(pool: Pool, address: string): Promise<UserRow | null> {
  await ensureUsersTable(pool);
  
  const walletAddress = normalizeAddress(address);
  
  const result = await pool.query(
    "DELETE FROM users WHERE wallet_address = $1 RETURNING *",
    [walletAddress]
  );
  
  return mapUserRow(result.rows[0]);
}

/**
 * Add to user's watchlist
 */
export async function addToWatchlist(
  pool: Pool,
  userId: string,
  tokenSymbol: string
): Promise<UserRow | null> {
  await ensureUsersTable(pool);
  
  const result = await pool.query(
    `UPDATE users
     SET watchlist = 
       CASE 
         WHEN watchlist IS NULL THEN jsonb_build_array($2)
         WHEN NOT (watchlist ? $2) THEN watchlist || jsonb_build_array($2)
         ELSE watchlist
       END,
       updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [userId, tokenSymbol.toUpperCase()]
  );
  
  return mapUserRow(result.rows[0]);
}

/**
 * Remove from user's watchlist
 */
export async function removeFromWatchlist(
  pool: Pool,
  userId: string,
  tokenSymbol: string
): Promise<UserRow | null> {
  await ensureUsersTable(pool);
  
  const result = await pool.query(
    `UPDATE users
     SET watchlist = watchlist - $2,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [userId, tokenSymbol.toUpperCase()]
  );
  
  return mapUserRow(result.rows[0]);
}

/**
 * Get user's watchlist
 */
export async function getWatchlist(
  pool: Pool,
  userId: string
): Promise<string[]> {
  await ensureUsersTable(pool);
  
  const result = await pool.query(
    "SELECT watchlist FROM users WHERE id = $1",
    [userId]
  );
  
  if (!result.rows[0] || !result.rows[0].watchlist) {
    return [];
  }
  
  return result.rows[0].watchlist;
}