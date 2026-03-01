// backend/postgres/perps.ts
import { Pool } from "pg";

let tableReady = false;

export interface PerpsTokenRow {
  id?: number;
  symbol: string;
  name: string;
  uuid?: string;
  token_address?: string;
  pair_standard?: string;
  pair_inverse?: string;
  base_precision?: number;
  quote_precision?: number;
  min_leverage?: number;
  max_leverage?: number;
  min_position_size?: number;
  max_position_size?: number;
  maintenance_margin?: number;
  funding_rate_coefficient?: number;
  is_active?: boolean;
  icon_url?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Ensure perps_tokens table exists
 */
export async function ensurePerpsTokensTable(pool: Pool): Promise<void> {
  if (tableReady) return;

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

  // Add token_address column if it doesn't exist (for existing tables)
  await pool.query(`
    ALTER TABLE perps_tokens 
    ADD COLUMN IF NOT EXISTS token_address VARCHAR(66)
  `);

  // Create indexes
  await pool.query('CREATE INDEX IF NOT EXISTS idx_perps_tokens_symbol ON perps_tokens(symbol)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_perps_tokens_active ON perps_tokens(is_active)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_perps_tokens_address ON perps_tokens(token_address)');

  tableReady = true;
}

/**
 * Map database row to PerpsTokenRow object
 */
export function mapPerpsTokenRow(row: any): PerpsTokenRow | null {
  if (!row) return null;
  return {
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    uuid: row.uuid,
    token_address: row.token_address,
    pair_standard: row.pair_standard,
    pair_inverse: row.pair_inverse,
    base_precision: row.base_precision ? parseInt(row.base_precision) : undefined,
    quote_precision: row.quote_precision ? parseInt(row.quote_precision) : undefined,
    min_leverage: row.min_leverage ? parseFloat(row.min_leverage) : undefined,
    max_leverage: row.max_leverage ? parseFloat(row.max_leverage) : undefined,
    min_position_size: row.min_position_size ? parseFloat(row.min_position_size) : undefined,
    max_position_size: row.max_position_size ? parseFloat(row.max_position_size) : undefined,
    maintenance_margin: row.maintenance_margin ? parseFloat(row.maintenance_margin) : undefined,
    funding_rate_coefficient: row.funding_rate_coefficient ? parseFloat(row.funding_rate_coefficient) : undefined,
    is_active: row.is_active,
    icon_url: row.icon_url,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

/**
 * Get all perps tokens
 */
export async function getAllPerpsTokens(
  pool: Pool, 
  options?: { onlyActive?: boolean }
): Promise<PerpsTokenRow[]> {
  await ensurePerpsTokensTable(pool);
  
  let query = 'SELECT * FROM perps_tokens';
  const values: any[] = [];

  if (options?.onlyActive) {
    query += ' WHERE is_active = true';
  }

  query += ' ORDER BY symbol ASC';

  const result = await pool.query(query, values);
  return result.rows.map(mapPerpsTokenRow).filter((t): t is PerpsTokenRow => t !== null);
}

/**
 * Get perps token by symbol
 */
export async function getPerpsTokenBySymbol(
  pool: Pool, 
  symbol: string
): Promise<PerpsTokenRow | null> {
  await ensurePerpsTokensTable(pool);
  
  const result = await pool.query(
    'SELECT * FROM perps_tokens WHERE LOWER(symbol) = LOWER($1)',
    [symbol]
  );
  
  return mapPerpsTokenRow(result.rows[0]);
}

/**
 * Get perps token by ID
 */
export async function getPerpsTokenById(
  pool: Pool, 
  id: number
): Promise<PerpsTokenRow | null> {
  await ensurePerpsTokensTable(pool);
  
  const result = await pool.query(
    'SELECT * FROM perps_tokens WHERE id = $1',
    [id]
  );
  
  return mapPerpsTokenRow(result.rows[0]);
}

/**
 * Create a new perps token
 */
export async function createPerpsToken(
  pool: Pool, 
  data: Partial<PerpsTokenRow>
): Promise<PerpsTokenRow> {
  await ensurePerpsTokensTable(pool);

  const {
    symbol,
    name,
    uuid,
    token_address,
    pair_standard,
    pair_inverse,
    base_precision = 8,
    quote_precision = 2,
    min_leverage = 1,
    max_leverage = 50,
    min_position_size = 10,
    max_position_size = 1000000,
    maintenance_margin = 0.005,
    funding_rate_coefficient = 0.0001,
    is_active = true,
    icon_url
  } = data;

  if (!symbol || !name) {
    throw new Error('Symbol and name are required');
  }

  try {
    const result = await pool.query(
      `INSERT INTO perps_tokens (
        symbol, name, uuid, token_address, pair_standard, pair_inverse,
        base_precision, quote_precision, min_leverage, max_leverage,
        min_position_size, max_position_size, maintenance_margin,
        funding_rate_coefficient, is_active, icon_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        symbol.toUpperCase(),
        name,
        uuid,
        token_address ? token_address.toLowerCase() : null,
        pair_standard,
        pair_inverse,
        base_precision,
        quote_precision,
        min_leverage,
        max_leverage,
        min_position_size,
        max_position_size,
        maintenance_margin,
        funding_rate_coefficient,
        is_active,
        icon_url
      ]
    );

    return mapPerpsTokenRow(result.rows[0])!;
  } catch (error: any) {
    if (error.code === '23505') {
      throw new Error('Perps token with this symbol already exists');
    }
    throw error;
  }
}

/**
 * Update an existing perps token
 */
export async function updatePerpsToken(
  pool: Pool,
  symbol: string,
  data: Partial<PerpsTokenRow>
): Promise<PerpsTokenRow | null> {
  await ensurePerpsTokensTable(pool);

  const existing = await getPerpsTokenBySymbol(pool, symbol);
  if (!existing) {
    return null;
  }

  const setClause: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  const fields: (keyof PerpsTokenRow)[] = [
    'name', 'uuid', 'token_address', 'pair_standard', 'pair_inverse',
    'base_precision', 'quote_precision', 'min_leverage', 'max_leverage',
    'min_position_size', 'max_position_size', 'maintenance_margin',
    'funding_rate_coefficient', 'is_active', 'icon_url'
  ];

  fields.forEach(field => {
    if (data[field] !== undefined) {
      setClause.push(`${field} = $${paramCount}`);
      values.push(data[field]);
      paramCount++;
    }
  });

  if (setClause.length === 0) {
    throw new Error('No valid fields to update');
  }

  setClause.push(`updated_at = NOW()`);
  values.push(symbol.toUpperCase());

  const query = `UPDATE perps_tokens 
                 SET ${setClause.join(', ')} 
                 WHERE LOWER(symbol) = LOWER($${paramCount})
                 RETURNING *`;

  const result = await pool.query(query, values);
  return mapPerpsTokenRow(result.rows[0]);
}

/**
 * Delete a perps token
 */
export async function deletePerpsToken(
  pool: Pool,
  symbol: string
): Promise<PerpsTokenRow | null> {
  await ensurePerpsTokensTable(pool);
  
  const result = await pool.query(
    'DELETE FROM perps_tokens WHERE LOWER(symbol) = LOWER($1) RETURNING *',
    [symbol]
  );
  
  return mapPerpsTokenRow(result.rows[0]);
}

/**
 * Toggle active status
 */
export async function togglePerpsTokenActive(
  pool: Pool,
  symbol: string,
  isActive: boolean
): Promise<PerpsTokenRow | null> {
  await ensurePerpsTokensTable(pool);
  
  const result = await pool.query(
    `UPDATE perps_tokens 
     SET is_active = $2, updated_at = NOW() 
     WHERE LOWER(symbol) = LOWER($1) 
     RETURNING *`,
    [symbol, isActive]
  );
  
  return mapPerpsTokenRow(result.rows[0]);
}