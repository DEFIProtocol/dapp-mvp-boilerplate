import { Client, Pool } from "pg";

interface ParsedDbUrl {
  dbName: string;
  adminUrl: string;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function parseDbUrl(connectionString: string): ParsedDbUrl {
  const parsed = new URL(connectionString);
  const dbName = parsed.pathname.replace(/^\//, "");
  parsed.pathname = "/postgres";
  return {
    dbName,
    adminUrl: parsed.toString(),
  };
}

export async function ensureDatabaseExists(connectionString: string): Promise<void> {
  const { dbName, adminUrl } = parseDbUrl(connectionString);

  if (!dbName) {
    throw new Error("DATABASE_URL does not include a database name");
  }

  const client = new Client({ connectionString: adminUrl });

  try {
    await client.connect();

    const existingDb = await client.query<{ exists: number }>(
      "SELECT 1 as exists FROM pg_database WHERE datname = $1",
      [dbName]
    );

    if (existingDb.rowCount && existingDb.rowCount > 0) {
      return;
    }

    await client.query(`CREATE DATABASE "${dbName}"`);
    console.log(`✅ Created database: ${dbName}`);
  } catch (error) {
    const message = getErrorMessage(error);

    // Ignore race where another process created the DB at the same time.
    if (message.toLowerCase().includes("already exists")) {
      return;
    }

    throw error;
  } finally {
    await client.end();
  }
}

export async function ensureCoreTables(pool: Pool): Promise<void> {
  await pool.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

  // Users
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
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS watchlist JSONB');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_users_wallet_address ON users(wallet_address)');

  // Tokens
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tokens (
      id SERIAL PRIMARY KEY,
      symbol VARCHAR(20) UNIQUE NOT NULL,
      name VARCHAR(100) NOT NULL,
      price NUMERIC,
      market_cap NUMERIC,
      volume_24h NUMERIC,
      decimals INTEGER DEFAULT 18,
      type VARCHAR(50),
      image TEXT,
      uuid VARCHAR(255),
      rapidapi_data JSONB,
      oneinch_data JSONB,
      chains JSONB,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query('ALTER TABLE tokens ADD COLUMN IF NOT EXISTS chains JSONB');
  await pool.query('ALTER TABLE tokens ADD COLUMN IF NOT EXISTS rapidapi_data JSONB');
  await pool.query('ALTER TABLE tokens ADD COLUMN IF NOT EXISTS oneinch_data JSONB');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_tokens_symbol ON tokens(symbol)');

  // Token addresses (matches existing helper expectations)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS token_address (
      id SERIAL PRIMARY KEY,
      token_id INTEGER REFERENCES tokens(id) ON DELETE CASCADE,
      token_symbol VARCHAR(20),
      chain VARCHAR(50) NOT NULL,
      address VARCHAR(100) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (token_id, chain)
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_token_address_token_id ON token_address(token_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_token_address_symbol ON token_address(token_symbol)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_token_address_chain ON token_address(chain)');

  // Perps
  await pool.query(`
    CREATE TABLE IF NOT EXISTS perps_tokens (
      id SERIAL PRIMARY KEY,
      symbol VARCHAR(20) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      uuid VARCHAR(100),
      token_address VARCHAR(66),
      pair_standard VARCHAR(30),
      pair_inverse VARCHAR(30),
      base_precision INTEGER DEFAULT 8,
      quote_precision INTEGER DEFAULT 2,
      min_leverage DECIMAL(4,2) DEFAULT 1,
      max_leverage DECIMAL(4,2) DEFAULT 50,
      min_position_size DECIMAL(20,2) DEFAULT 10,
      max_position_size DECIMAL(20,2) DEFAULT 1000000,
      maintenance_margin DECIMAL(5,4) DEFAULT 0.005,
      funding_rate_coefficient DECIMAL(10,4) DEFAULT 0.0001,
      is_active BOOLEAN DEFAULT true,
      icon_url TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query('ALTER TABLE perps_tokens ADD COLUMN IF NOT EXISTS token_address VARCHAR(66)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_perps_tokens_symbol ON perps_tokens(symbol)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_perps_tokens_active ON perps_tokens(is_active)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_perps_tokens_address ON perps_tokens(token_address)');

  // Spot (new)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS spot_tokens (
      id SERIAL PRIMARY KEY,
      symbol VARCHAR(20) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      token_address VARCHAR(66),
      quote_asset VARCHAR(20) DEFAULT 'USDC',
      min_order_size NUMERIC(20,8) DEFAULT 0.0001,
      max_order_size NUMERIC(20,8) DEFAULT 1000000,
      price_precision INTEGER DEFAULT 8,
      quantity_precision INTEGER DEFAULT 8,
      maker_fee NUMERIC(10,6) DEFAULT 0.001,
      taker_fee NUMERIC(10,6) DEFAULT 0.002,
      is_active BOOLEAN DEFAULT true,
      icon_url TEXT,
      chains JSONB,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_spot_tokens_symbol ON spot_tokens(symbol)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_spot_tokens_active ON spot_tokens(is_active)');

  // Options (new)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS options_tokens (
      id SERIAL PRIMARY KEY,
      symbol VARCHAR(30) NOT NULL UNIQUE,
      name VARCHAR(120) NOT NULL,
      underlying_symbol VARCHAR(20) NOT NULL,
      option_type VARCHAR(4) NOT NULL CHECK (option_type IN ('CALL', 'PUT')),
      strike_price NUMERIC(20,8),
      expiry TIMESTAMP,
      settlement_type VARCHAR(10) DEFAULT 'CASH' CHECK (settlement_type IN ('CASH', 'PHYSICAL')),
      contract_size NUMERIC(20,8) DEFAULT 1,
      min_order_size NUMERIC(20,8) DEFAULT 0.01,
      max_order_size NUMERIC(20,8) DEFAULT 10000,
      maker_fee NUMERIC(10,6) DEFAULT 0.001,
      taker_fee NUMERIC(10,6) DEFAULT 0.002,
      implied_volatility NUMERIC(12,8),
      token_address VARCHAR(66),
      is_active BOOLEAN DEFAULT true,
      icon_url TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_options_tokens_symbol ON options_tokens(symbol)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_options_tokens_underlying ON options_tokens(underlying_symbol)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_options_tokens_active ON options_tokens(is_active)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_options_tokens_expiry ON options_tokens(expiry)');
}