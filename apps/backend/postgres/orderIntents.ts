import { Pool } from "pg";

export type PerpsOrderSide = "LONG" | "SHORT";
export type PerpsOrderType = "market" | "limit";
export type SpotOrderSide = "buy" | "sell";
export type SpotOrderType = "market" | "limit";
export type OrderIntentStatus = "queued" | "open" | "filled" | "cancelled" | "expired" | "rejected";

export type PerpsOrderIntentRow = {
  id: string;
  createdAt: string;
  symbol: string;
  marketId: string;
  subAccountId?: string;
  perpAddress: string;
  trader: string;
  side: PerpsOrderSide;
  orderType: PerpsOrderType;
  exposureUsd: number;
  leverage: number;
  limitPrice?: number;
  status: OrderIntentStatus;
};

export type SpotOrderIntentRow = {
  id: string;
  createdAt: string;
  symbol: string;
  trader: string;
  side: SpotOrderSide;
  orderType: SpotOrderType;
  quantity: number;
  limitPrice?: number;
  status: OrderIntentStatus;
};

let tablesReady = false;

function mapPerpsIntent(row: any): PerpsOrderIntentRow {
  return {
    id: row.id,
    createdAt: new Date(row.created_at).toISOString(),
    symbol: row.symbol,
    marketId: row.market_id,
    subAccountId: row.sub_account_id ?? undefined,
    perpAddress: row.perp_address,
    trader: row.trader,
    side: row.side,
    orderType: row.order_type,
    exposureUsd: Number(row.exposure_usd),
    leverage: Number(row.leverage),
    limitPrice: row.limit_price != null ? Number(row.limit_price) : undefined,
    status: row.status,
  };
}

function mapSpotIntent(row: any): SpotOrderIntentRow {
  return {
    id: row.id,
    createdAt: new Date(row.created_at).toISOString(),
    symbol: row.symbol,
    trader: row.trader,
    side: row.side,
    orderType: row.order_type,
    quantity: Number(row.quantity),
    limitPrice: row.limit_price != null ? Number(row.limit_price) : undefined,
    status: row.status,
  };
}

export async function ensureOrderIntentTables(pool: Pool): Promise<void> {
  if (tablesReady) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS perps_order_intents (
      id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      symbol VARCHAR(30) NOT NULL,
      market_id TEXT NOT NULL,
      sub_account_id TEXT,
      perp_address VARCHAR(66) NOT NULL,
      trader VARCHAR(66) NOT NULL,
      side VARCHAR(5) NOT NULL,
      order_type VARCHAR(10) NOT NULL,
      exposure_usd NUMERIC(36, 12) NOT NULL,
      leverage NUMERIC(20, 8) NOT NULL,
      limit_price NUMERIC(36, 12),
      status VARCHAR(10) NOT NULL DEFAULT 'queued'
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS spot_order_intents (
      id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      symbol VARCHAR(30) NOT NULL,
      trader VARCHAR(66) NOT NULL,
      side VARCHAR(5) NOT NULL,
      order_type VARCHAR(10) NOT NULL,
      quantity NUMERIC(36, 12) NOT NULL,
      limit_price NUMERIC(36, 12),
      status VARCHAR(10) NOT NULL DEFAULT 'queued'
    )
  `);

  await pool.query("CREATE INDEX IF NOT EXISTS idx_perps_order_intents_trader ON perps_order_intents(trader)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_perps_order_intents_symbol ON perps_order_intents(symbol)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_perps_order_intents_status ON perps_order_intents(status)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_spot_order_intents_trader ON spot_order_intents(trader)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_spot_order_intents_symbol ON spot_order_intents(symbol)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_spot_order_intents_status ON spot_order_intents(status)");

  tablesReady = true;
}

export async function createPerpsOrderIntent(pool: Pool, input: PerpsOrderIntentRow): Promise<PerpsOrderIntentRow> {
  await ensureOrderIntentTables(pool);

  const result = await pool.query(
    `INSERT INTO perps_order_intents (
      id, symbol, market_id, sub_account_id, perp_address, trader, side,
      order_type, exposure_usd, leverage, limit_price, status, created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    RETURNING *`,
    [
      input.id,
      input.symbol,
      input.marketId,
      input.subAccountId ?? null,
      input.perpAddress.toLowerCase(),
      input.trader.toLowerCase(),
      input.side,
      input.orderType,
      input.exposureUsd,
      input.leverage,
      input.limitPrice ?? null,
      input.status,
      input.createdAt,
    ],
  );

  return mapPerpsIntent(result.rows[0]);
}

export async function createSpotOrderIntent(pool: Pool, input: SpotOrderIntentRow): Promise<SpotOrderIntentRow> {
  await ensureOrderIntentTables(pool);

  const result = await pool.query(
    `INSERT INTO spot_order_intents (
      id, symbol, trader, side, order_type, quantity, limit_price, status, created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING *`,
    [
      input.id,
      input.symbol,
      input.trader.toLowerCase(),
      input.side,
      input.orderType,
      input.quantity,
      input.limitPrice ?? null,
      input.status,
      input.createdAt,
    ],
  );

  return mapSpotIntent(result.rows[0]);
}

export async function listPerpsOrderIntentsForTrader(
  pool: Pool,
  trader: string,
  filters?: { symbol?: string; marketId?: string; subAccountId?: string; statuses?: OrderIntentStatus[] },
): Promise<PerpsOrderIntentRow[]> {
  await ensureOrderIntentTables(pool);

  const values: Array<string | OrderIntentStatus[]> = [trader.toLowerCase()];
  const where: string[] = ["trader = $1"];

  if (filters?.symbol) {
    values.push(filters.symbol.toUpperCase());
    where.push(`symbol = $${values.length}`);
  }

  if (filters?.marketId) {
    values.push(filters.marketId.toLowerCase());
    where.push(`LOWER(market_id) = $${values.length}`);
  }

  if (filters?.subAccountId) {
    values.push(filters.subAccountId);
    where.push(`sub_account_id = $${values.length}`);
  }

  if (filters?.statuses && filters.statuses.length > 0) {
    values.push(filters.statuses);
    where.push(`status = ANY($${values.length})`);
  }

  const query = `
    SELECT * FROM perps_order_intents
    WHERE ${where.join(" AND ")}
    ORDER BY created_at DESC
    LIMIT 50
  `;

  const result = await pool.query(query, values);
  return result.rows.map(mapPerpsIntent);
}

export async function listOpenPerpsOrderIntentsBySymbol(pool: Pool, symbol: string): Promise<PerpsOrderIntentRow[]> {
  await ensureOrderIntentTables(pool);

  const result = await pool.query(
    `SELECT * FROM perps_order_intents
     WHERE symbol = $1 AND status IN ('queued', 'open')
     ORDER BY created_at DESC`,
    [symbol.toUpperCase()],
  );

  return result.rows.map(mapPerpsIntent);
}

export async function listSpotOrderIntentsForTrader(
  pool: Pool,
  trader: string,
  filters?: { symbol?: string; statuses?: OrderIntentStatus[] },
): Promise<SpotOrderIntentRow[]> {
  await ensureOrderIntentTables(pool);

  const values: Array<string | OrderIntentStatus[]> = [trader.toLowerCase()];
  const where: string[] = ["trader = $1"];

  if (filters?.symbol) {
    values.push(filters.symbol.toUpperCase());
    where.push(`symbol = $${values.length}`);
  }

  if (filters?.statuses && filters.statuses.length > 0) {
    values.push(filters.statuses);
    where.push(`status = ANY($${values.length})`);
  }

  const query = `
    SELECT * FROM spot_order_intents
    WHERE ${where.join(" AND ")}
    ORDER BY created_at DESC
    LIMIT 100
  `;

  const result = await pool.query(query, values);
  return result.rows.map(mapSpotIntent);
}

export async function listOpenSpotOrderIntentsBySymbol(pool: Pool, symbol: string): Promise<SpotOrderIntentRow[]> {
  await ensureOrderIntentTables(pool);

  const result = await pool.query(
    `SELECT * FROM spot_order_intents
     WHERE symbol = $1 AND status IN ('queued', 'open')
     ORDER BY created_at DESC`,
    [symbol.toUpperCase()],
  );

  return result.rows.map(mapSpotIntent);
}

export async function updatePerpsOrderIntentStatus(
  pool: Pool,
  id: string,
  trader: string,
  status: OrderIntentStatus,
): Promise<PerpsOrderIntentRow | null> {
  await ensureOrderIntentTables(pool);

  const result = await pool.query(
    `UPDATE perps_order_intents
     SET status = $3
     WHERE id = $1 AND trader = $2
     RETURNING *`,
    [id, trader.toLowerCase(), status],
  );

  if (result.rows.length === 0) return null;
  return mapPerpsIntent(result.rows[0]);
}

export async function updateSpotOrderIntentStatus(
  pool: Pool,
  id: string,
  trader: string,
  status: OrderIntentStatus,
): Promise<SpotOrderIntentRow | null> {
  await ensureOrderIntentTables(pool);

  const result = await pool.query(
    `UPDATE spot_order_intents
     SET status = $3
     WHERE id = $1 AND trader = $2
     RETURNING *`,
    [id, trader.toLowerCase(), status],
  );

  if (result.rows.length === 0) return null;
  return mapSpotIntent(result.rows[0]);
}
