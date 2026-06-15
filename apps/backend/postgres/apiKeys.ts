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
  await pool.query('CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(api_key_hash)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_api_keys_status ON api_keys(status)');
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
