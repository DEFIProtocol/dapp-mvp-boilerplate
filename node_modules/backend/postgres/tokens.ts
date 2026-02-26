import { Pool } from "pg";
import fs from 'fs/promises';
import path from 'path';

export interface TokenRow {
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
  rapidapi_data?: any;
  oneinch_data?: any;
  chains?: any;
  created_at?: string;
  updated_at?: string;
}

export interface TokenAddressRow {
  token_id?: number;
  token_symbol?: string;
  chain: string;
  address: string;
}

export interface TokenAddressMeta {
  columns: Set<string>;
  tokenIdCol: string | null;
  tokenSymbolCol: string | null;
  chainCol: string | null;
  addressCol: string | null;
}

export interface TokenAddressMap {
  byTokenId: Map<number, Record<string, string>>;
  bySymbol: Map<string, Record<string, string>>;
  meta: TokenAddressMeta;
}

// Database row types
interface TokenAddressDbRow {
  token_id?: number;
  token_symbol?: string;
  symbol?: string;
  chain: string;
  address: string;
}

// Cache for token address metadata
let tokenAddressMetaCache: TokenAddressMeta | null = null;

// Cache for token table columns
let tokenTableColumnsCache: Set<string> | null = null;

/**
 * Normalize address to lowercase
 */
export function normalizeAddress(address: string): string {
  if (!address) return '';
  return address.toString().trim().toLowerCase();
}

/**
 * Safely handle unknown error
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Get metadata about token_address table columns
 */
export async function getTokenAddressMeta(pool: Pool): Promise<TokenAddressMeta> {
  if (tokenAddressMetaCache) return tokenAddressMetaCache;
  
  try {
    const result = await pool.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'token_address'"
    );
    const columns = new Set(result.rows.map(row => row.column_name));

    const meta: TokenAddressMeta = {
      columns,
      tokenIdCol: columns.has('token_id') ? 'token_id' : null,
      tokenSymbolCol: columns.has('token_symbol')
        ? 'token_symbol'
        : columns.has('symbol')
        ? 'symbol'
        : null,
      chainCol: columns.has('chain')
        ? 'chain'
        : columns.has('network')
        ? 'network'
        : null,
      addressCol: columns.has('address')
        ? 'address'
        : columns.has('contract_address')
        ? 'contract_address'
        : null
    };

    tokenAddressMetaCache = meta;
    return meta;
  } catch (error) {
    console.error('Error getting token address meta:', getErrorMessage(error));
    const meta: TokenAddressMeta = {
      columns: new Set(),
      tokenIdCol: null,
      tokenSymbolCol: null,
      chainCol: null,
      addressCol: null
    };
    tokenAddressMetaCache = meta;
    return meta;
  }
}

/**
 * Get token by symbol
 */
export async function getTokenBySymbol(pool: Pool, symbol: string): Promise<TokenRow | null> {
  const result = await pool.query<TokenRow>(
    'SELECT * FROM tokens WHERE LOWER(symbol) = LOWER($1)',
    [symbol]
  );
  return result.rows[0] || null;
}

/**
 * Get columns from tokens table
 */
export async function getTokenTableColumns(pool: Pool): Promise<Set<string>> {
  if (tokenTableColumnsCache) return tokenTableColumnsCache;
  
  try {
    const result = await pool.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'tokens'"
    );
    const columns = new Set(result.rows.map(row => row.column_name));
    tokenTableColumnsCache = columns;
    return columns;
  } catch (error) {
    console.error('Error getting token table columns:', getErrorMessage(error));
    tokenTableColumnsCache = new Set();
    return tokenTableColumnsCache;
  }
}

/**
 * Ensure chains column exists
 */
export async function ensureChainsColumn(pool: Pool): Promise<void> {
  const columns = await getTokenTableColumns(pool);
  if (columns.has('chains')) return;
  
  try {
    await pool.query('ALTER TABLE tokens ADD COLUMN IF NOT EXISTS chains JSONB');
    tokenTableColumnsCache = null;
    await getTokenTableColumns(pool);
    console.log('[tokens] added chains JSONB column');
  } catch (error) {
    console.error('[tokens] failed to add chains column:', getErrorMessage(error));
  }
}

/**
 * Get map of token addresses by token ID and symbol
 */
export async function getTokenAddressesMap(pool: Pool): Promise<TokenAddressMap> {
  const meta = await getTokenAddressMeta(pool);
  const byTokenId = new Map<number, Record<string, string>>();
  const bySymbol = new Map<string, Record<string, string>>();

  if (!meta.chainCol || !meta.addressCol) {
    return { byTokenId, bySymbol, meta };
  }

  if (meta.tokenIdCol) {
    const query = `SELECT ${meta.tokenIdCol} AS token_id, ${meta.chainCol} AS chain, ${meta.addressCol} AS address FROM token_address`;
    const result = await pool.query<TokenAddressDbRow>(query);

    for (const row of result.rows) {
      if (row.token_id === null || row.token_id === undefined) continue;
      if (!byTokenId.has(row.token_id)) byTokenId.set(row.token_id, {});
      const existing = byTokenId.get(row.token_id)!;
      existing[row.chain] = row.address;
    }

    return { byTokenId, bySymbol, meta };
  }

  if (meta.tokenSymbolCol) {
    const query = `SELECT ${meta.tokenSymbolCol} AS symbol, ${meta.chainCol} AS chain, ${meta.addressCol} AS address FROM token_address`;
    const result = await pool.query<TokenAddressDbRow>(query);

    for (const row of result.rows) {
      const symbolKey = row.symbol ? row.symbol.toLowerCase() : null;
      if (!symbolKey) continue;
      if (!bySymbol.has(symbolKey)) bySymbol.set(symbolKey, {});
      const existing = bySymbol.get(symbolKey)!;
      existing[row.chain] = row.address;
    }

    return { byTokenId, bySymbol, meta };
  }

  return { byTokenId, bySymbol, meta };
}

/**
 * Get addresses for a specific token (sync version using pre-fetched map)
 */
export function getTokenAddressesForTokenSync(
  addressMap: TokenAddressMap, 
  tokenId?: number, 
  symbol?: string
): Record<string, string> {
  if (addressMap.byTokenId.size && tokenId !== undefined && tokenId !== null) {
    return addressMap.byTokenId.get(tokenId) || {};
  } else if (addressMap.bySymbol.size && symbol) {
    return addressMap.bySymbol.get(symbol.toLowerCase()) || {};
  }
  return {};
}

/**
 * Get addresses for a specific token (async version)
 */
export async function getTokenAddressesForToken(
  pool: Pool, 
  { tokenId, symbol }: { tokenId?: number; symbol?: string }
): Promise<Record<string, string>> {
  const meta = await getTokenAddressMeta(pool);
  if (!meta.chainCol || !meta.addressCol) return {};

  let result: { rows: TokenAddressDbRow[] } = { rows: [] };

  if (meta.tokenIdCol && tokenId !== null && tokenId !== undefined) {
    const query = `SELECT ${meta.chainCol} AS chain, ${meta.addressCol} AS address FROM token_address WHERE ${meta.tokenIdCol} = $1`;
    result = await pool.query<TokenAddressDbRow>(query, [tokenId]);
  } else if (meta.tokenSymbolCol && symbol) {
    const query = `SELECT ${meta.chainCol} AS chain, ${meta.addressCol} AS address FROM token_address WHERE LOWER(${meta.tokenSymbolCol}) = LOWER($1)`;
    result = await pool.query<TokenAddressDbRow>(query, [symbol]);
  }

  const addresses: Record<string, string> = {};
  for (const row of result.rows) {
    if (row.chain) addresses[row.chain] = row.address;
  }
  return addresses;
}

/**
 * Get all tokens with enriched addresses
 */
export async function getAllTokens(pool: Pool): Promise<TokenRow[]> {
  const result = await pool.query<TokenRow>('SELECT * FROM tokens ORDER BY symbol');
  const tokens = result.rows;
  const addressMap = await getTokenAddressesMap(pool);
  
  return tokens.map(token => ({
    ...token,
    addresses: getTokenAddressesForTokenSync(addressMap, token.id, token.symbol)
  }));
}

/**
 * Create a new token
 */
export async function createToken(pool: Pool, data: Partial<TokenRow>): Promise<TokenRow> {
  await ensureChainsColumn(pool);
  
  const {
    symbol,
    name,
    price,
    market_cap,
    volume_24h,
    decimals,
    type,
    image,
    uuid,
    rapidapi_data,
    oneinch_data,
    chains
  } = data;

  if (!symbol || !name) {
    throw new Error('Symbol and name are required');
  }

  const columns = await getTokenTableColumns(pool);
  const insertColumns: string[] = [];
  const values: any[] = [];

  const addField = (col: string, value: any) => {
    if (!columns.has(col)) return;
    if (value === undefined) return;
    insertColumns.push(col);
    values.push(value);
  };

  addField('symbol', symbol.toUpperCase());
  addField('name', name);
  addField('price', price || 0);
  addField('market_cap', market_cap || 0);
  addField('volume_24h', volume_24h || 0);
  addField('decimals', decimals || 18);
  addField('type', type || 'ERC-20');
  addField('image', image);
  addField('uuid', uuid);
  addField('rapidapi_data', rapidapi_data);
  addField('oneinch_data', oneinch_data);
  addField('chains', chains);
  addField('created_at', new Date());
  addField('updated_at', new Date());

  if (!insertColumns.includes('symbol') || !insertColumns.includes('name')) {
    throw new Error('Tokens table schema missing required columns');
  }

  const placeholders = values.map((_, idx) => `$${idx + 1}`).join(', ');
  const query = `INSERT INTO tokens (${insertColumns.join(', ')}) VALUES (${placeholders}) RETURNING *`;
  
  try {
    const result = await pool.query<TokenRow>(query, values);
    return result.rows[0];
  } catch (error) {
    const pgError = error as { code?: string };
    if (pgError.code === '23505') { // unique_violation
      throw new Error('Token with this symbol already exists');
    }
    throw error;
  }
}

/**
 * Update an existing token
 */
export async function updateToken(
  pool: Pool, 
  symbol: string, 
  data: Partial<TokenRow>
): Promise<TokenRow | null> {
  await ensureChainsColumn(pool);

  const allowedFields = [
    'symbol', 'name', 'price', 'market_cap', 'volume_24h', 'type', 'decimals',
    'address', 'image', 'ticker', 'rank', 'change',
    'uuid', 'rapidapi_data', 'oneinch_data', 'chains'
  ];

  const existingToken = await getTokenBySymbol(pool, symbol);
  if (!existingToken) {
    return null;
  }

  const mergedData = { ...existingToken, ...data };
  const setClause: string[] = [];
  const values: any[] = [symbol];
  let paramCount = 2;

  const columns = await getTokenTableColumns(pool);

  for (const [key, value] of Object.entries(mergedData)) {
    if (
      allowedFields.includes(key) &&
      columns.has(key) &&
      value !== undefined &&
      value !== null
    ) {
      setClause.push(`${key} = $${paramCount}`);
      values.push(value);
      paramCount++;
    }
  }

  if (setClause.length === 0) {
    throw new Error('No valid fields to update');
  }

  if (columns.has('updated_at')) {
    setClause.push(`updated_at = NOW()`);
  }

  const query = `UPDATE tokens 
                SET ${setClause.join(', ')}
                WHERE LOWER(symbol) = LOWER($1)
                RETURNING *`;

  const result = await pool.query<TokenRow>(query, values);
  return result.rows[0] || null;
}

/**
 * Delete a token
 */
export async function deleteToken(pool: Pool, symbol: string): Promise<TokenRow | null> {
  const result = await pool.query<TokenRow>(
    'DELETE FROM tokens WHERE LOWER(symbol) = LOWER($1) RETURNING *',
    [symbol]
  );
  return result.rows[0] || null;
}

/**
 * Token address CRUD operations
 */

/**
 * Create a token address
 */
export async function createTokenAddress(
  pool: Pool,
  symbol: string,
  chain: string,
  address: string
): Promise<TokenAddressRow> {
  const token = await getTokenBySymbol(pool, symbol);
  if (!token) {
    throw new Error('Token not found');
  }

  const meta = await getTokenAddressMeta(pool);
  if (!meta.chainCol || !meta.addressCol) {
    throw new Error('token_address table schema is missing required columns');
  }

  const columns: string[] = [];
  const values: any[] = [];

  if (meta.tokenIdCol && token.id !== undefined && token.id !== null) {
    columns.push(meta.tokenIdCol);
    values.push(token.id);
  }

  if (meta.tokenSymbolCol) {
    columns.push(meta.tokenSymbolCol);
    values.push(token.symbol);
  }

  columns.push(meta.chainCol);
  values.push(chain);

  columns.push(meta.addressCol);
  values.push(normalizeAddress(address));

  if (columns.length < 3) {
    throw new Error('token_address table schema is missing required link columns');
  }

  const placeholders = values.map((_, idx) => `$${idx + 1}`).join(', ');
  const query = `INSERT INTO token_address (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`;
  
  const result = await pool.query<TokenAddressRow>(query, values);
  return result.rows[0];
}

/**
 * Update a token address
 */
export async function updateTokenAddress(
  pool: Pool,
  symbol: string,
  chain: string,
  address: string
): Promise<TokenAddressRow | null> {
  const token = await getTokenBySymbol(pool, symbol);
  if (!token) {
    throw new Error('Token not found');
  }

  const meta = await getTokenAddressMeta(pool);
  if (!meta.chainCol || !meta.addressCol) {
    throw new Error('token_address table schema is missing required columns');
  }

  const where: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (meta.tokenIdCol && token.id !== undefined && token.id !== null) {
    where.push(`${meta.tokenIdCol} = $${paramCount}`);
    values.push(token.id);
    paramCount++;
  } else if (meta.tokenSymbolCol) {
    where.push(`LOWER(${meta.tokenSymbolCol}) = LOWER($${paramCount})`);
    values.push(token.symbol);
    paramCount++;
  } else {
    throw new Error('token_address table schema is missing token link column');
  }

  where.push(`${meta.chainCol} = $${paramCount}`);
  values.push(chain);
  paramCount++;

  values.push(normalizeAddress(address));
  const query = `UPDATE token_address SET ${meta.addressCol} = $${paramCount} WHERE ${where.join(' AND ')} RETURNING *`;
  
  const result = await pool.query<TokenAddressRow>(query, values);
  return result.rows[0] || null;
}

/**
 * Delete a token address
 */
export async function deleteTokenAddress(
  pool: Pool,
  symbol: string,
  chain: string
): Promise<TokenAddressRow | null> {
  const token = await getTokenBySymbol(pool, symbol);
  if (!token) {
    throw new Error('Token not found');
  }

  const meta = await getTokenAddressMeta(pool);
  if (!meta.chainCol || !meta.addressCol) {
    throw new Error('token_address table schema is missing required columns');
  }

  const where: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (meta.tokenIdCol && token.id !== undefined && token.id !== null) {
    where.push(`${meta.tokenIdCol} = $${paramCount}`);
    values.push(token.id);
    paramCount++;
  } else if (meta.tokenSymbolCol) {
    where.push(`LOWER(${meta.tokenSymbolCol}) = LOWER($${paramCount})`);
    values.push(token.symbol);
    paramCount++;
  } else {
    throw new Error('token_address table schema is missing token link column');
  }

  where.push(`${meta.chainCol} = $${paramCount}`);
  values.push(chain);

  const query = `DELETE FROM token_address WHERE ${where.join(' AND ')} RETURNING *`;
  const result = await pool.query<TokenAddressRow>(query, values);

  return result.rows[0] || null;
}

/**
 * JSON file operations
 */

/**
 * Get tokens from JSON file
 */
export async function getJsonTokens(pool: Pool): Promise<any[]> {
  try {
    // Try different paths - one of these should work
    const possiblePaths = [
      path.join(process.cwd(), 'data/tokens_smart_consolidated.json'),
      path.join(process.cwd(), 'server/data/tokens_smart_consolidated.json'),
      path.join(__dirname, '../../../data/tokens_smart_consolidated.json'),
      './tokens_smart_consolidated.json',
      '../tokens_smart_consolidated.json',
      'tokens_smart_consolidated.json'
    ];

    let successfulPath: string | null = null;
    let fileData: string | null = null;

    // Try each path
    for (const jsonPath of possiblePaths) {
      try {
        fileData = await fs.readFile(jsonPath, 'utf-8');
        successfulPath = jsonPath;
        break;
      } catch (err) {
        // Continue to next path
      }
    }

    if (!successfulPath || !fileData) {
      // If file doesn't exist, generate it
      console.log('JSON file not found, generating from database...');
      return await generateAndWriteJsonFile(pool);
    }

    return JSON.parse(fileData);
  } catch (error) {
    console.error('❌ Error reading JSON file:', getErrorMessage(error));
    throw error;
  }
}

/**
 * Generate and write JSON file from database
 */
export async function generateAndWriteJsonFile(pool: Pool): Promise<any[]> {
  try {
    console.log('🔄 Generating JSON file from database...');

    // Check database connection
    await pool.query('SELECT 1');

    // Get all tokens with addresses
    const tokens = await getAllTokens(pool);

    // Find or create JSON file path
    let jsonFilePath: string;
    const possiblePaths = [
      path.join(process.cwd(), 'data/tokens_smart_consolidated.json'),
      path.join(process.cwd(), 'server/data/tokens_smart_consolidated.json'),
      path.join(__dirname, '../../../data/tokens_smart_consolidated.json'),
      './tokens_smart_consolidated.json',
    ];

    // Try to find existing file
    let foundPath: string | undefined;
    for (const possiblePath of possiblePaths) {
      try {
        await fs.access(possiblePath);
        foundPath = possiblePath;
        break;
      } catch (err) {
        // Continue
      }
    }

    // If file doesn't exist, create it
    if (!foundPath) {
      // Ensure data directory exists
      const dataDir = path.join(process.cwd(), 'data');
      try {
        await fs.mkdir(dataDir, { recursive: true });
      } catch (err) {
        // Directory might already exist
      }
      jsonFilePath = path.join(dataDir, 'tokens_smart_consolidated.json');
      console.log(`📁 Creating new JSON file at: ${jsonFilePath}`);
    } else {
      jsonFilePath = foundPath;
    }

    // Create backup if file exists
    try {
      await fs.access(jsonFilePath);
      const backupPath = `${jsonFilePath}.backup`;
      await fs.copyFile(jsonFilePath, backupPath);
      console.log(`💾 Created backup at: ${backupPath}`);
    } catch (err) {
      // No existing file, skip backup
    }

    // Write to file
    await fs.writeFile(jsonFilePath, JSON.stringify(tokens, null, 2));

    console.log(`✅ JSON file updated successfully. Tokens: ${tokens.length}`);
    return tokens;
  } catch (error) {
    console.error('❌ Error updating JSON file:', getErrorMessage(error));
    throw error;
  }
}