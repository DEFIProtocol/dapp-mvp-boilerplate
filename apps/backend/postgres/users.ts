import { Pool } from "pg";
import { redis } from "../redis";

export interface UserRow {
  id?: string;
  wallet_address: string;
  email?: string;
  email_verified?: boolean;
  username?: string;
  chain_addresses?: any;
  preferences?: any;
  watchlist?: any;
  is_verified_by_coinbase?: boolean;
  paper_trading_grant_count?: number;
  paper_trading_last_grant_at?: string;
  paper_trading_last_grant_tx_hash?: string;
  paper_trading_last_grant_chain_id?: number;
  paper_trading_challenge_nonce?: string;
  paper_trading_challenge_expires_at?: string;
  paper_trading_admin_override_at?: string;
  paper_trading_admin_override_by?: string;
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
  return isValidAddress(value);
}

export function isValidAddress(value: string): boolean {
  const normalized = String(value || "").trim();
  return (
    /^0x[a-fA-F0-9]{40}$/.test(normalized) &&
    normalized !== "0x0000000000000000000000000000000000000000" &&
    normalized.toLowerCase() !== "0x1111111111111111111111111111111111111111"
  );
}

/**
 * Safely extract error message
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function cacheUserRecord(walletAddress: string, user: UserRow | null): Promise<void> {
  if (!redis.isOpen || !user) return;
  try {
    await redis.set(`user:${walletAddress}`, JSON.stringify(user), {
      EX: 300,
    });
  } catch (error) {
    console.warn("⚠️ Redis cache write failed for user:", error);
  }
}

async function clearUserCache(walletAddress: string): Promise<void> {
  if (!redis.isOpen) return;
  try {
    await redis.del(`user:${walletAddress}`);
  } catch (error) {
    console.warn("⚠️ Redis cache delete failed for user:", error);
  }
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
      email_verified BOOLEAN DEFAULT FALSE,
      username VARCHAR(50),
      chain_addresses JSONB,
      preferences JSONB,
      watchlist JSONB,
      is_verified_by_coinbase BOOLEAN DEFAULT FALSE,
      paper_trading_grant_count INTEGER DEFAULT 0,
      paper_trading_last_grant_at TIMESTAMP,
      paper_trading_last_grant_tx_hash VARCHAR(100),
      paper_trading_last_grant_chain_id INTEGER,
      paper_trading_challenge_nonce VARCHAR(128),
      paper_trading_challenge_expires_at TIMESTAMP,
      paper_trading_admin_override_at TIMESTAMP,
      paper_trading_admin_override_by VARCHAR(66),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Add watchlist column if it doesn't exist (for backward compatibility)
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS watchlist JSONB');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS paper_trading_grant_count INTEGER DEFAULT 0');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS paper_trading_last_grant_at TIMESTAMP');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS paper_trading_last_grant_tx_hash VARCHAR(100)');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS paper_trading_last_grant_chain_id INTEGER');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS paper_trading_challenge_nonce VARCHAR(128)');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS paper_trading_challenge_expires_at TIMESTAMP');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS paper_trading_admin_override_at TIMESTAMP');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS paper_trading_admin_override_by VARCHAR(66)');

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
    email_verified: row.email_verified,
    username: row.username,
    chain_addresses: row.chain_addresses,
    preferences: row.preferences,
    watchlist: row.watchlist,
    is_verified_by_coinbase: row.is_verified_by_coinbase,
    paper_trading_grant_count: row.paper_trading_grant_count,
    paper_trading_last_grant_at: row.paper_trading_last_grant_at,
    paper_trading_last_grant_tx_hash: row.paper_trading_last_grant_tx_hash,
    paper_trading_last_grant_chain_id: row.paper_trading_last_grant_chain_id,
    paper_trading_challenge_nonce: row.paper_trading_challenge_nonce,
    paper_trading_challenge_expires_at: row.paper_trading_challenge_expires_at,
    paper_trading_admin_override_at: row.paper_trading_admin_override_at,
    paper_trading_admin_override_by: row.paper_trading_admin_override_by,
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
  if (!walletAddress || !isValidAddress(walletAddress)) {
    console.warn('[users] getUserByWallet called with invalid address:', address);
    return null;
  }

  if (redis.isOpen) {
    try {
      const cached = await redis.get(`user:${walletAddress}`);
      if (cached) {
        return JSON.parse(cached) as UserRow;
      }
    } catch (error) {
      console.warn("⚠️ Redis cache read failed for user:", error);
    }
  }

  try {
    const result = await pool.query("SELECT * FROM users WHERE wallet_address = $1", [walletAddress]);
    const user = mapUserRow(result.rows[0]);
    if (!user) {
      console.warn('[users] User not found for wallet:', walletAddress);
      // Clear any stale cache
      await clearUserCache(walletAddress);
      return null;
    }

    try {
      await cacheUserRecord(walletAddress, user);
    } catch (err) {
      console.warn('[users] Failed to cache user after DB read:', getErrorMessage(err));
    }

    return user;
  } catch (error) {
    console.error('[users] Error reading user by wallet:', walletAddress, getErrorMessage(error));
    throw error;
  }
}

/**
 * Create a new user
 */
export async function createUser(pool: Pool, data: Partial<UserRow>): Promise<UserRow | null> {
  await ensureUsersTable(pool);
  
  const { 
    wallet_address, 
    email, 
    email_verified,
    username, 
    is_verified_by_coinbase, 
    chain_addresses, 
    preferences,
    watchlist 
  } = data;
  
  const normalizedWallet = normalizeAddress(wallet_address || '');

  if (!normalizedWallet || !isValidAddress(normalizedWallet)) {
    console.warn('[users] createUser called with invalid wallet_address:', wallet_address);
    throw new Error('Valid wallet_address is required');
  }

  const payload = {
    wallet_address: normalizedWallet,
    email: email || null,
    email_verified: email_verified === true,
    username: username || null,
    is_verified_by_coinbase: is_verified_by_coinbase === true,
    chain_addresses: normalizeJsonb(chain_addresses),
    preferences: normalizeJsonb(preferences),
    watchlist: normalizeJsonb(watchlist)
  };

  try {
    const result = await pool.query(
      `INSERT INTO users (wallet_address, email, email_verified, username, chain_addresses, preferences, watchlist, is_verified_by_coinbase)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8)
       RETURNING *`,
      [
        payload.wallet_address,
        payload.email,
        payload.email_verified,
        payload.username,
        payload.chain_addresses,
        payload.preferences,
        payload.watchlist,
        payload.is_verified_by_coinbase
      ]
    );

    const user = mapUserRow(result.rows[0]);
    await cacheUserRecord(normalizedWallet, user);
    return user;
  } catch (error) {
    console.error('[users] Error creating user', { wallet: normalizedWallet, payload }, getErrorMessage(error));
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
    email_verified,
    username, 
    is_verified_by_coinbase, 
    chain_addresses, 
    preferences,
    watchlist 
  } = data;

  const result = await pool.query(
    `UPDATE users
     SET email = COALESCE($2, email),
         email_verified = COALESCE($3, email_verified),
         username = COALESCE($4, username),
         chain_addresses = COALESCE($5::jsonb, chain_addresses),
         preferences = COALESCE($6::jsonb, preferences),
         watchlist = COALESCE($7::jsonb, watchlist),
         is_verified_by_coinbase = COALESCE($8, is_verified_by_coinbase),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      email ?? null,
      email_verified,
      username ?? null,
      normalizeJsonb(chain_addresses),
      normalizeJsonb(preferences),
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
  
  if (!walletAddress || !isValidAddress(walletAddress)) {
    throw new Error('Valid wallet_address is required');
  }

  const { 
    email, 
    email_verified,
    username, 
    is_verified_by_coinbase, 
    chain_addresses, 
    preferences,
    watchlist 
  } = data;

  const result = await pool.query(
    `UPDATE users
     SET email = COALESCE($2, email),
         email_verified = COALESCE($3, email_verified),
         username = COALESCE($4, username),
         chain_addresses = COALESCE($5::jsonb, chain_addresses),
         preferences = COALESCE($6::jsonb, preferences),
         watchlist = COALESCE($7::jsonb, watchlist),
         is_verified_by_coinbase = COALESCE($8, is_verified_by_coinbase),
         updated_at = NOW()
     WHERE wallet_address = $1
     RETURNING *`,
    [
      walletAddress,
      email ?? null,
      email_verified,
      username ?? null,
      normalizeJsonb(chain_addresses),
      normalizeJsonb(preferences),
      normalizeJsonb(watchlist),
      is_verified_by_coinbase
    ]
  );

  const user = mapUserRow(result.rows[0]);
  if (user) {
    await cacheUserRecord(walletAddress, user);
  } else {
    await clearUserCache(walletAddress);
  }

  return user;
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
  
  const user = mapUserRow(result.rows[0]);
  if (user) {
    await clearUserCache(walletAddress);
  }
  return user;
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
         WHEN watchlist IS NULL THEN jsonb_build_array($2::text)
         WHEN NOT (watchlist ? $2::text) THEN watchlist || jsonb_build_array($2::text)
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
     SET watchlist = watchlist - $2::text,
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

/**
 * Set or refresh the paper trading challenge for a wallet.
 */
export async function setPaperTradingChallenge(
  pool: Pool,
  address: string,
  nonce: string,
  expiresAt: Date
): Promise<UserRow | null> {
  await ensureUsersTable(pool);

  const walletAddress = normalizeAddress(address);
  const result = await pool.query(
    `UPDATE users
     SET paper_trading_challenge_nonce = $2,
         paper_trading_challenge_expires_at = $3,
         updated_at = NOW()
     WHERE wallet_address = $1
     RETURNING *`,
    [walletAddress, nonce, expiresAt]
  );

  return mapUserRow(result.rows[0]);
}

/**
 * Commit a successful paper trading grant after on-chain confirmation.
 */
export async function commitPaperTradingGrant(
  pool: Pool,
  address: string,
  txHash: string,
  chainId: number
): Promise<UserRow | null> {
  await ensureUsersTable(pool);

  const walletAddress = normalizeAddress(address);
  const result = await pool.query(
    `UPDATE users
     SET paper_trading_grant_count = COALESCE(paper_trading_grant_count, 0) + 1,
         paper_trading_last_grant_at = NOW(),
         paper_trading_last_grant_tx_hash = $2,
         paper_trading_last_grant_chain_id = $3,
         paper_trading_challenge_nonce = NULL,
         paper_trading_challenge_expires_at = NULL,
         updated_at = NOW()
     WHERE wallet_address = $1
     RETURNING *`,
    [walletAddress, txHash, chainId]
  );

  return mapUserRow(result.rows[0]);
}

/**
 * Set an admin override timestamp for a wallet.
 */
export async function setPaperTradingAdminOverride(
  pool: Pool,
  address: string,
  adminAddress: string
): Promise<UserRow | null> {
  await ensureUsersTable(pool);

  const walletAddress = normalizeAddress(address);
  const overrideAddress = normalizeAddress(adminAddress);

  const result = await pool.query(
    `UPDATE users
     SET paper_trading_admin_override_at = NOW(),
         paper_trading_admin_override_by = $2,
         updated_at = NOW()
     WHERE wallet_address = $1
     RETURNING *`,
    [walletAddress, overrideAddress]
  );

  return mapUserRow(result.rows[0]);
}