/**
 * Database helpers for perp orders, fills, and history
 */
import { Pool } from 'pg';

export interface PerpOrder {
  id: number;
  order_id: string;
  trader_address: string;
  symbol: string;
  market_id: string;
  side: 'LONG' | 'SHORT';
  order_type: 'market' | 'limit';
  original_size: string;
  remaining_size: string;
  filled_size: string;
  leverage: string;
  limit_price?: string;
  status: 'pending' | 'partial' | 'filled' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface PerpOrderFill {
  id: number;
  order_id: string;
  match_id: string;
  counterparty_order_id: string;
  fill_size: string;
  fill_price: string;
  tx_hash?: string;
  filled_at: string;
}

export interface PerpOrderHistory {
  id: number;
  order_id: string;
  event_type: 'created' | 'filled' | 'partial' | 'cancelled' | 'matched';
  details: any;
  timestamp: string;
}

let tableReady = false;

export async function ensurePerpOrderTables(pool: Pool): Promise<void> {
  if (tableReady) return;

  // Create perp_orders table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS perp_orders (
      id SERIAL PRIMARY KEY,
      order_id VARCHAR(66) UNIQUE NOT NULL,
      trader_address VARCHAR(66) NOT NULL,
      symbol VARCHAR(20) NOT NULL,
      market_id VARCHAR(66) NOT NULL,
      side VARCHAR(10) NOT NULL,
      order_type VARCHAR(10) NOT NULL,
      original_size DECIMAL(20, 2) NOT NULL,
      remaining_size DECIMAL(20, 2) NOT NULL,
      filled_size DECIMAL(20, 2) DEFAULT 0,
      leverage DECIMAL(10, 2) NOT NULL,
      limit_price DECIMAL(20, 2),
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Create perp_order_fills table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS perp_order_fills (
      id SERIAL PRIMARY KEY,
      order_id VARCHAR(66) NOT NULL,
      match_id VARCHAR(66) NOT NULL,
      counterparty_order_id VARCHAR(66) NOT NULL,
      fill_size DECIMAL(20, 2) NOT NULL,
      fill_price DECIMAL(20, 2) NOT NULL,
      tx_hash VARCHAR(66),
      filled_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Create perp_order_history table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS perp_order_history (
      id SERIAL PRIMARY KEY,
      order_id VARCHAR(66) NOT NULL,
      event_type VARCHAR(20) NOT NULL,
      details JSONB,
      timestamp TIMESTAMP DEFAULT NOW()
    )
  `);

  // Create indexes
  await pool.query('CREATE INDEX IF NOT EXISTS idx_perp_orders_status ON perp_orders(status)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_perp_orders_market ON perp_orders(market_id, status)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_perp_orders_trader ON perp_orders(trader_address)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_perp_order_fills_order ON perp_order_fills(order_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_perp_order_history_order ON perp_order_history(order_id)');

  tableReady = true;
}

// Create a new order
export async function createOrder(pool: Pool, order: Omit<PerpOrder, 'id' | 'created_at' | 'updated_at'>): Promise<PerpOrder> {
  const result = await pool.query(
    `INSERT INTO perp_orders 
      (order_id, trader_address, symbol, market_id, side, order_type, original_size, remaining_size, filled_size, leverage, limit_price, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      order.order_id,
      order.trader_address,
      order.symbol,
      order.market_id,
      order.side,
      order.order_type,
      order.original_size,
      order.remaining_size,
      order.filled_size,
      order.leverage,
      order.limit_price,
      order.status,
    ]
  );
  return result.rows[0];
}

// Get pending orders for a market
export async function getPendingOrdersForMarket(pool: Pool, marketId: string): Promise<PerpOrder[]> {
  const result = await pool.query(
    `SELECT * FROM perp_orders 
     WHERE market_id = $1 AND status IN ('pending', 'partial')
     ORDER BY created_at ASC`,
    [marketId]
  );
  return result.rows;
}

// Get orders by trader
export async function getOrdersByTrader(pool: Pool, traderAddress: string, status?: string): Promise<PerpOrder[]> {
  let query = 'SELECT * FROM perp_orders WHERE trader_address = $1';
  const params: any[] = [traderAddress];
  
  if (status) {
    query += ' AND status = $2';
    params.push(status);
  }
  
  query += ' ORDER BY created_at DESC';
  
  const result = await pool.query(query, params);
  return result.rows;
}

// Update order after fill
export async function updateOrderAfterFill(
  pool: Pool,
  orderId: string,
  fillSize: number,
  newStatus: 'partial' | 'filled'
): Promise<void> {
  await pool.query(
    `UPDATE perp_orders 
     SET filled_size = filled_size + $2,
         remaining_size = remaining_size - $2,
         status = $3,
         updated_at = NOW()
     WHERE order_id = $1`,
    [orderId, fillSize, newStatus]
  );
}

// Record a fill
export async function recordFill(pool: Pool, fill: Omit<PerpOrderFill, 'id' | 'filled_at'>): Promise<void> {
  await pool.query(
    `INSERT INTO perp_order_fills (order_id, match_id, counterparty_order_id, fill_size, fill_price, tx_hash)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [fill.order_id, fill.match_id, fill.counterparty_order_id, fill.fill_size, fill.fill_price, fill.tx_hash]
  );
}

// Log order history event
export async function logOrderHistory(
  pool: Pool,
  orderId: string,
  eventType: PerpOrderHistory['event_type'],
  details: any
): Promise<void> {
  await pool.query(
    `INSERT INTO perp_order_history (order_id, event_type, details)
     VALUES ($1, $2, $3)`,
    [orderId, eventType, JSON.stringify(details)]
  );
}

// Cancel an order
export async function cancelOrder(pool: Pool, orderId: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE perp_orders 
     SET status = 'cancelled', updated_at = NOW()
     WHERE order_id = $1 AND status IN ('pending', 'partial')
     RETURNING *`,
    [orderId]
  );
  return (result.rowCount ?? 0) > 0;
}

// Get order fills
export async function getOrderFills(pool: Pool, orderId: string): Promise<PerpOrderFill[]> {
  const result = await pool.query(
    'SELECT * FROM perp_order_fills WHERE order_id = $1 ORDER BY filled_at DESC',
    [orderId]
  );
  return result.rows;
}

// Get order history
export async function getOrderHistory(pool: Pool, traderAddress: string, limit: number = 50): Promise<any[]> {
  const result = await pool.query(
    `SELECT o.*, h.event_type, h.details, h.timestamp as event_timestamp
     FROM perp_orders o
     LEFT JOIN perp_order_history h ON o.order_id = h.order_id
     WHERE o.trader_address = $1
     ORDER BY o.created_at DESC, h.timestamp DESC
     LIMIT $2`,
    [traderAddress, limit]
  );
  return result.rows;
}
