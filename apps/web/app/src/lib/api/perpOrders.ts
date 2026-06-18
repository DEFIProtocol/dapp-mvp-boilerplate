/**
 * API functions for perp orders
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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

export interface OrderFill {
  id: number;
  order_id: string;
  match_id: string;
  counterparty_order_id: string;
  fill_size: string;
  fill_price: string;
  tx_hash?: string;
  filled_at: string;
}

/**
 * Get orders for a trader
 */
export async function getTraderOrders(
  traderAddress: string,
  status?: 'pending' | 'partial' | 'filled' | 'cancelled'
): Promise<PerpOrder[]> {
  const url = new URL(`${API_BASE}/api/smart-contracts/perps/orders/${traderAddress}`);
  if (status) {
    url.searchParams.set('status', status);
  }

  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      // Return empty array instead of throwing for 404
      if (response.status === 404) {
        return [];
      }
      throw new Error(`Failed to fetch orders: ${response.statusText}`);
    }

    const data = await response.json();
    return data.orders || [];
  } catch (error) {
    console.warn('Error fetching orders:', error);
    return [];
  }
}

/**
 * Get open orders (pending + partial)
 */
export async function getOpenOrders(traderAddress: string): Promise<PerpOrder[]> {
  const allOrders = await getTraderOrders(traderAddress);
  return allOrders.filter(o => o.status === 'pending' || o.status === 'partial');
}

/**
 * Cancel an order
 */
export async function cancelOrder(orderId: string): Promise<boolean> {
  const response = await fetch(
    `${API_BASE}/api/smart-contracts/perps/orders/${orderId}`,
    {
      method: 'DELETE',
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to cancel order: ${response.statusText}`);
  }

  const data = await response.json();
  return data.success;
}

/**
 * Get order history for a trader
 */
export async function getOrderHistory(
  traderAddress: string,
  limit: number = 50
): Promise<any[]> {
  const url = new URL(`${API_BASE}/api/smart-contracts/perps/history/${traderAddress}`);
  url.searchParams.set('limit', limit.toString());

  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      // Return empty array instead of throwing for 404
      if (response.status === 404) {
        return [];
      }
      throw new Error(`Failed to fetch order history: ${response.statusText}`);
    }

    const data = await response.json();
    return data.history || [];
  } catch (error) {
    console.warn('Error fetching order history:', error);
    return [];
  }
}
