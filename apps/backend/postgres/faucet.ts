/**
 * Database helpers for the paper-trading USDC faucet's per-wallet rate
 * limit. The old on-chain limit lived inside MockUSDCFaucet.mint() itself
 * (a rolling 24h/wallet cap), but users no longer call the faucet contract
 * directly - the backend now transfers from its own treasury wallet - so
 * the 24h/wallet cap has to be re-enforced here instead, otherwise nothing
 * would stop a single wallet from draining the treasury with repeated
 * claim requests.
 */
import { Pool } from "pg";

export interface FaucetClaim {
  id: number;
  wallet_address: string;
  amount: string;
  tx_hash: string;
  created_at: string;
}

let tableReady = false;

export async function ensureFaucetTables(pool: Pool): Promise<void> {
  if (tableReady) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS faucet_claims (
      id SERIAL PRIMARY KEY,
      wallet_address VARCHAR(66) NOT NULL,
      amount NUMERIC(30, 6) NOT NULL,
      tx_hash VARCHAR(66) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(
    "CREATE INDEX IF NOT EXISTS idx_faucet_claims_wallet_created ON faucet_claims(wallet_address, created_at)"
  );

  tableReady = true;
}

/**
 * Returns the wallet's most recent claim within the last 24h, or null if
 * it's eligible to claim again right now.
 */
export async function getActiveClaimWindow(
  pool: Pool,
  walletAddress: string
): Promise<FaucetClaim | null> {
  const result = await pool.query<FaucetClaim>(
    `SELECT * FROM faucet_claims
     WHERE wallet_address = $1 AND created_at > NOW() - INTERVAL '24 hours'
     ORDER BY created_at DESC
     LIMIT 1`,
    [walletAddress]
  );
  return result.rows[0] ?? null;
}

export async function recordFaucetClaim(
  pool: Pool,
  walletAddress: string,
  amount: string,
  txHash: string
): Promise<FaucetClaim> {
  const result = await pool.query<FaucetClaim>(
    `INSERT INTO faucet_claims (wallet_address, amount, tx_hash)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [walletAddress, amount, txHash]
  );
  return result.rows[0];
}
