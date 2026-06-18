import crypto from "crypto";
import { Pool } from "pg";

export interface ApiKeyRow {
  id?: string;
  owner_name?: string;
  owner_email?: string;
  description?: string;
  allowed_endpoints?: string[];
  status?: string;
  rate_limit_per_minute?: number;
  api_key_salt?: string;
  api_key_hash?: string;
  created_at?: string;
  updated_at?: string;
  last_used_at?: string;
  usage_count?: number;
  // Tier system
  tier?: string;
  daily_spend_limit_usd?: number;
  balance_usd?: number;
  requester_wallet?: string;
}

export interface GeneratedApiKey {
  rawKey: string;
  salt: string;
  hash: string;
}

export function generateApiKeyMaterial(): GeneratedApiKey {
  const secret = crypto.randomBytes(32).toString("hex");
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = getApiKeyHash(secret, salt);

  return {
    rawKey: secret,
    salt,
    hash,
  };
}

export function getApiKeyHash(rawKey: string, salt: string): string {
  return crypto
    .createHash("sha256")
    .update(`${salt}:${rawKey}`)
    .digest("hex");
}

export async function ensureApiKeysTable(pool: Pool): Promise<void> {
  await pool.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_name VARCHAR(128),
      owner_email VARCHAR(255),
      description TEXT,
      api_key_salt TEXT NOT NULL,
      api_key_hash TEXT NOT NULL,
      allowed_endpoints JSONB DEFAULT '[]'::jsonb,
      status VARCHAR(20) DEFAULT 'ACTIVE',
      rate_limit_per_minute INTEGER DEFAULT 120,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      last_used_at TIMESTAMP,
      usage_count INTEGER DEFAULT 0
    )
  `);

  await pool.query('ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS owner_name VARCHAR(128)');
  await pool.query('ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS owner_email VARCHAR(255)');
  await pool.query('ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS description TEXT');
  await pool.query("ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS api_key_salt TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS api_key_hash TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS allowed_endpoints JSONB DEFAULT '[]'::jsonb");
  await pool.query("ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'ACTIVE'");
  await pool.query('ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS rate_limit_per_minute INTEGER DEFAULT 120');
  await pool.query('ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP');
  await pool.query('ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0');
  
  // Tier system columns
  await pool.query("ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS tier VARCHAR(20) DEFAULT 'SANDBOX'");
  await pool.query('ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS daily_spend_limit_usd DECIMAL(10, 2)');
  await pool.query('ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS balance_usd DECIMAL(20, 2) DEFAULT 0');
  await pool.query('ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS requester_wallet VARCHAR(66)');
  
  await pool.query('CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(api_key_hash)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_api_keys_status ON api_keys(status)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_api_keys_tier ON api_keys(tier)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_api_keys_wallet ON api_keys(requester_wallet)');
  
  // Deposit tracking table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_key_deposits (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      api_key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE,
      wallet_address VARCHAR(66) NOT NULL,
      amount_usdc DECIMAL(20, 6) NOT NULL,
      tx_hash VARCHAR(66) UNIQUE NOT NULL,
      verified BOOLEAN DEFAULT FALSE,
      verified_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_deposits_api_key ON api_key_deposits(api_key_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_deposits_tx_hash ON api_key_deposits(tx_hash)');
  
  // Usage log table (90-day retention)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS api_key_usage_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      api_key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE,
      endpoint VARCHAR(255) NOT NULL,
      status_code INTEGER,
      response_time_ms INTEGER,
      cost_usd DECIMAL(10, 6),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_usage_log_api_key ON api_key_usage_log(api_key_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_usage_log_created_at ON api_key_usage_log(created_at)');
}

export function mapApiKeyRow(row: any): ApiKeyRow | null {
  if (!row) return null;
  return {
    id: row.id,
    owner_name: row.owner_name,
    owner_email: row.owner_email,
    description: row.description,
    allowed_endpoints: row.allowed_endpoints,
    status: row.status,
    api_key_salt: row.api_key_salt,
    api_key_hash: row.api_key_hash,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_used_at: row.last_used_at,
    usage_count: row.usage_count,
    tier: row.tier,
    daily_spend_limit_usd: row.daily_spend_limit_usd ? parseFloat(row.daily_spend_limit_usd) : undefined,
    balance_usd: row.balance_usd ? parseFloat(row.balance_usd) : undefined,
    requester_wallet: row.requester_wallet,
  };
}

export async function createApiKey(
  pool: Pool,
  ownerName: string | null,
  ownerEmail: string | null,
  description: string | null,
  allowedEndpoints: string[] = [],
  rateLimitPerMinute: number | null = null
): Promise<{ apiKey: ApiKeyRow; rawApiKey: string }> {
  await ensureApiKeysTable(pool);

  const material = generateApiKeyMaterial();
  const result = await pool.query(
    `INSERT INTO api_keys (owner_name, owner_email, description, api_key_salt, api_key_hash, allowed_endpoints, rate_limit_per_minute)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, COALESCE($7, 120))
     RETURNING *`,
    [ownerName, ownerEmail, description, material.salt, material.hash, JSON.stringify(allowedEndpoints), rateLimitPerMinute]
  );

  const apiKey = mapApiKeyRow(result.rows[0]);
  if (!apiKey || !apiKey.id) {
    throw new Error("Failed to create API key");
  }

  return {
    apiKey,
    rawApiKey: `${apiKey.id}.${material.rawKey}`,
  };
}

export async function getApiKeyById(pool: Pool, id: string): Promise<ApiKeyRow | null> {
  await ensureApiKeysTable(pool);
  const result = await pool.query(`SELECT * FROM api_keys WHERE id = $1 LIMIT 1`, [id]);
  return mapApiKeyRow(result.rows[0]);
}

export async function getApiKeyByHash(pool: Pool, hash: string): Promise<ApiKeyRow | null> {
  await ensureApiKeysTable(pool);
  const result = await pool.query(`
    SELECT * FROM api_keys
    WHERE api_key_hash = $1
      AND status = 'ACTIVE'
    LIMIT 1
  `, [hash]);
  return mapApiKeyRow(result.rows[0]);
}

export async function getApiKeys(pool: Pool): Promise<ApiKeyRow[]> {
  await ensureApiKeysTable(pool);
  const result = await pool.query(`SELECT * FROM api_keys ORDER BY created_at DESC`);
  return result.rows.map(mapApiKeyRow).filter((row): row is ApiKeyRow => row !== null);
}

export async function updateApiKey(
  pool: Pool,
  id: string,
  updates: Partial<Pick<ApiKeyRow, "owner_name" | "owner_email" | "description" | "allowed_endpoints" | "status" | "rate_limit_per_minute">>
): Promise<ApiKeyRow | null> {
  await ensureApiKeysTable(pool);
  const result = await pool.query(
    `UPDATE api_keys
     SET owner_name = COALESCE($2, owner_name),
         owner_email = COALESCE($3, owner_email),
         description = COALESCE($4, description),
         allowed_endpoints = COALESCE($5::jsonb, allowed_endpoints),
         status = COALESCE($6, status),
         rate_limit_per_minute = COALESCE($7, rate_limit_per_minute),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      updates.owner_name ?? null,
      updates.owner_email ?? null,
      updates.description ?? null,
      updates.allowed_endpoints ? JSON.stringify(updates.allowed_endpoints) : null,
      updates.status ?? null,
      updates.rate_limit_per_minute ?? null,
    ]
  );
  return mapApiKeyRow(result.rows[0]);
}

export async function recordApiKeyUsage(pool: Pool, apiKeyId: string): Promise<void> {
  await ensureApiKeysTable(pool);
  await pool.query(
    `UPDATE api_keys
     SET usage_count = COALESCE(usage_count, 0) + 1,
         last_used_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [apiKeyId]
  );
}

// ===== TIER SYSTEM FUNCTIONS =====

export const TIER_CONFIG = {
  SANDBOX: {
    rate_limit: 60,
    daily_spend_limit: null,
    requires_kyc: false,
    requires_deposit: false,
  },
  PRODUCTION_LITE: {
    rate_limit: 120,
    daily_spend_limit: 10.00,
    requires_kyc: false,
    requires_deposit: true,
    min_deposit: 25.00,
  },
  ENTERPRISE: {
    rate_limit: 1000,
    daily_spend_limit: null,
    requires_kyc: true,
    requires_deposit: true,
    min_deposit: 100.00,
  },
};

export async function createTieredApiKey(
  pool: Pool,
  tier: string,
  ownerName: string | null,
  ownerEmail: string | null,
  description: string | null,
  requesterWallet: string | null
): Promise<{ apiKey: ApiKeyRow; rawApiKey: string }> {
  await ensureApiKeysTable(pool);

  const config = TIER_CONFIG[tier as keyof typeof TIER_CONFIG];
  if (!config) {
    throw new Error(`Invalid tier: ${tier}`);
  }

  const material = generateApiKeyMaterial();
  const result = await pool.query(
    `INSERT INTO api_keys (
      owner_name, owner_email, description, api_key_salt, api_key_hash,
      tier, rate_limit_per_minute, daily_spend_limit_usd, requester_wallet
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *`,
    [
      ownerName,
      ownerEmail,
      description,
      material.salt,
      material.hash,
      tier,
      config.rate_limit,
      config.daily_spend_limit,
      requesterWallet,
    ]
  );

  const apiKey = mapApiKeyRow(result.rows[0]);
  if (!apiKey || !apiKey.id) {
    throw new Error("Failed to create API key");
  }

  return {
    apiKey,
    rawApiKey: `${apiKey.id}.${material.rawKey}`,
  };
}

export async function addDeposit(
  pool: Pool,
  apiKeyId: string,
  walletAddress: string,
  amountUsdc: number,
  txHash: string
): Promise<void> {
  await ensureApiKeysTable(pool);
  await pool.query(
    `INSERT INTO api_key_deposits (api_key_id, wallet_address, amount_usdc, tx_hash)
     VALUES ($1, $2, $3, $4)`,
    [apiKeyId, walletAddress, amountUsdc, txHash]
  );
}

export async function verifyDeposit(pool: Pool, depositId: string): Promise<void> {
  await ensureApiKeysTable(pool);
  
  // Get deposit info
  const depositResult = await pool.query(
    `SELECT api_key_id, amount_usdc FROM api_key_deposits WHERE id = $1`,
    [depositId]
  );
  
  if (depositResult.rows.length === 0) {
    throw new Error("Deposit not found");
  }
  
  const { api_key_id, amount_usdc } = depositResult.rows[0];
  
  // Mark deposit as verified
  await pool.query(
    `UPDATE api_key_deposits SET verified = TRUE, verified_at = NOW() WHERE id = $1`,
    [depositId]
  );
  
  // Add to balance
  await pool.query(
    `UPDATE api_keys SET balance_usd = COALESCE(balance_usd, 0) + $1 WHERE id = $2`,
    [amount_usdc, api_key_id]
  );
}

export async function getApiKeysByWallet(pool: Pool, wallet: string): Promise<ApiKeyRow[]> {
  await ensureApiKeysTable(pool);
  const result = await pool.query(
    `SELECT * FROM api_keys WHERE requester_wallet = $1 ORDER BY created_at DESC`,
    [wallet.toLowerCase()]
  );
  return result.rows.map(mapApiKeyRow).filter((row): row is ApiKeyRow => row !== null);
}

export async function logUsage(
  pool: Pool,
  apiKeyId: string,
  endpoint: string,
  statusCode: number,
  responseTimeMs: number,
  costUsd: number
): Promise<void> {
  await ensureApiKeysTable(pool);
  await pool.query(
    `INSERT INTO api_key_usage_log (api_key_id, endpoint, status_code, response_time_ms, cost_usd)
     VALUES ($1, $2, $3, $4, $5)`,
    [apiKeyId, endpoint, statusCode, responseTimeMs, costUsd]
  );
  
  // Deduct from balance if applicable
  if (costUsd > 0) {
    await pool.query(
      `UPDATE api_keys SET balance_usd = COALESCE(balance_usd, 0) - $1 WHERE id = $2`,
      [costUsd, apiKeyId]
    );
  }
}
