/**
 * Order Matching Engine
 * 
 * Matches opposing LONG and SHORT orders based on price-time priority.
 * Supports partial fills and calls settlementService to execute on-chain.
 */

import { Pool } from 'pg';
import { ethers } from 'ethers';
import { SettlementService } from '../routes/SmartContracts/settlementService';
import * as orderHelpers from '../postgres/perpOrders';

interface MatchResult {
  longOrderId: string;
  shortOrderId: string;
  matchSize: number;
  matchPrice: number;
  txHash?: string;
}

export class OrderMatchingEngine {
  private pool: Pool;
  private isRunning: boolean = false;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Match orders for a specific market
   */
  async matchOrdersForMarket(marketId: string): Promise<MatchResult[]> {
    try {
      // Get all pending orders for this market
      const allOrders = await orderHelpers.getPendingOrdersForMarket(this.pool, marketId);
      
      // Separate LONG and SHORT orders
      const longOrders = allOrders
        .filter(o => o.side === 'LONG')
        .sort((a, b) => {
          // Sort by price DESC (highest first), then time ASC (earliest first)
          const priceA = parseFloat(a.limit_price || '0');
          const priceB = parseFloat(b.limit_price || '0');
          if (priceB !== priceA) return priceB - priceA;
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        });

      const shortOrders = allOrders
        .filter(o => o.side === 'SHORT')
        .sort((a, b) => {
          // Sort by price ASC (lowest first), then time ASC (earliest first)
          const priceA = parseFloat(a.limit_price || '0');
          const priceB = parseFloat(b.limit_price || '0');
          if (priceA !== priceB) return priceA - priceB;
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        });

      const matches: MatchResult[] = [];

      // Match orders
      for (const longOrder of longOrders) {
        if (parseFloat(longOrder.remaining_size) <= 0) continue;

        for (const shortOrder of shortOrders) {
          if (parseFloat(shortOrder.remaining_size) <= 0) continue;

          // Check if prices overlap. A missing/zero limit price means "market
          // order" and always crosses (mirrors OrderLib.doOrdersCross on-chain).
          const longPrice = parseFloat(longOrder.limit_price || '0');
          const shortPrice = parseFloat(shortOrder.limit_price || '0');
          const crosses = longPrice === 0 || shortPrice === 0 || longPrice >= shortPrice;

          if (crosses) {
            // Match found! Execute at maker's price (better for taker)
            const matchPrice = this.resolveMatchPrice(longOrder, shortOrder, longPrice, shortPrice);
            const matchSize = Math.min(
              parseFloat(longOrder.remaining_size),
              parseFloat(shortOrder.remaining_size)
            );

            try {
              // Execute the match on-chain
              const matchResult = await this.executeMatch(
                longOrder,
                shortOrder,
                matchSize,
                matchPrice
              );

              matches.push(matchResult);

              // Update local order objects for next iteration
              longOrder.remaining_size = (parseFloat(longOrder.remaining_size) - matchSize).toString();
              shortOrder.remaining_size = (parseFloat(shortOrder.remaining_size) - matchSize).toString();

              console.log(`[OrderMatching] Matched ${matchSize} @ $${matchPrice} - LONG: ${longOrder.order_id.slice(0, 10)}... SHORT: ${shortOrder.order_id.slice(0, 10)}...`);
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              console.error(`[OrderMatching] Failed to execute match between ${longOrder.order_id} and ${shortOrder.order_id}:`, message);

              // Permanent/validation failures should not be retried forever -
              // reject the order(s) that are structurally invalid so they stop
              // clogging the book. Transient/network failures are left as
              // 'pending' so the next matching cycle retries them.
              const permanent = /invalid signature|expired|nonce|market mismatch|not tradeable|missing signature|missing expiry/i.test(message);
              if (permanent) {
                await orderHelpers.markOrderRejected(this.pool, longOrder.order_id, message);
                await orderHelpers.markOrderRejected(this.pool, shortOrder.order_id, message);
                longOrder.remaining_size = '0';
                shortOrder.remaining_size = '0';
              }
            }
          }

          // If long order is fully filled, move to next long order
          if (parseFloat(longOrder.remaining_size) <= 0) break;
        }
      }

      return matches;
    } catch (error) {
      console.error(`[OrderMatching] Error matching orders for market ${marketId}:`, error);
      return [];
    }
  }

  /**
   * Resolve the price a crossing match should settle at. Mirrors
   * OrderLib.getMatchPrice: if both sides posted a limit price, use the
   * midpoint; otherwise fall back to the maker's limit price (a pure
   * market/market cross is priced by the contract's own mark price, so we
   * just pass 0 through and let matchSize/price be recomputed on-chain).
   */
  private resolveMatchPrice(
    longOrder: orderHelpers.PerpOrder,
    shortOrder: orderHelpers.PerpOrder,
    longPrice: number,
    shortPrice: number
  ): number {
    if (longPrice > 0 && shortPrice > 0) {
      return (longPrice + shortPrice) / 2;
    }
    // One side is a market order - use whichever side actually posted a limit,
    // otherwise fall back to maker priority (earlier order).
    if (longPrice > 0) return longPrice;
    if (shortPrice > 0) return shortPrice;
    return longOrder.created_at < shortOrder.created_at ? longPrice : shortPrice;
  }

  /**
   * Build an OrderLib.Order-compatible struct from a stored order row.
   */
  private toOnChainOrder(order: orderHelpers.PerpOrder, sideValue: 0 | 1) {
    return {
      trader: order.trader_address,
      side: sideValue,
      exposure: ethers.parseUnits(order.original_size, 18),
      limitPrice: ethers.parseUnits(order.limit_price || '0', 18),
      expiry: BigInt(order.expiry),
      nonce: BigInt(order.nonce),
      marketId: order.market_id,
    };
  }

  /**
   * Execute a match on-chain and update database.
   *
   * The SettlementEngine contract verifies a real EIP-712 signature per
   * order (OrderLib.verifySignature), so the signature stored with each
   * order at placement time (signed client-side by the trader's wallet)
   * must be passed through untouched here - the backend cannot forge it.
   */
  private async executeMatch(
    longOrder: orderHelpers.PerpOrder,
    shortOrder: orderHelpers.PerpOrder,
    matchSize: number,
    matchPrice: number
  ): Promise<MatchResult> {
    if (!longOrder.signature || !shortOrder.signature) {
      throw new Error('Order missing signature - cannot settle on-chain');
    }
    if (!longOrder.expiry || !shortOrder.expiry || !longOrder.nonce || !shortOrder.nonce) {
      throw new Error('Order missing expiry/nonce - cannot settle on-chain');
    }

    const settlement = new SettlementService();
    const matchId = ethers.id(`${longOrder.order_id}-${shortOrder.order_id}-${Date.now()}`);

    const longOrderData = this.toOnChainOrder(longOrder, 0);
    const shortOrderData = this.toOnChainOrder(shortOrder, 1);

    // Execute on-chain
    const txHash = await settlement.settleMatchWithRolesForMarket(
      longOrder.market_id,
      longOrderData,
      longOrder.signature,
      shortOrderData,
      shortOrder.signature,
      ethers.parseUnits(matchSize.toString(), 18),
      shortOrder.created_at > longOrder.created_at // shortIsTaker
    );

    // Update database
    await this.updateOrdersAfterMatch(longOrder, shortOrder, matchSize, matchPrice, matchId, txHash);

    return {
      longOrderId: longOrder.order_id,
      shortOrderId: shortOrder.order_id,
      matchSize,
      matchPrice,
      txHash,
    };
  }

  /**
   * Update orders in database after a match
   */
  private async updateOrdersAfterMatch(
    longOrder: orderHelpers.PerpOrder,
    shortOrder: orderHelpers.PerpOrder,
    matchSize: number,
    matchPrice: number,
    matchId: string,
    txHash: string
  ): Promise<void> {
    // Update long order
    const longRemaining = parseFloat(longOrder.remaining_size) - matchSize;
    const longStatus = longRemaining <= 0 ? 'filled' : 'partial';
    await orderHelpers.updateOrderAfterFill(this.pool, longOrder.order_id, matchSize, longStatus);

    // Update short order
    const shortRemaining = parseFloat(shortOrder.remaining_size) - matchSize;
    const shortStatus = shortRemaining <= 0 ? 'filled' : 'partial';
    await orderHelpers.updateOrderAfterFill(this.pool, shortOrder.order_id, matchSize, shortStatus);

    // Record fills
    await orderHelpers.recordFill(this.pool, {
      order_id: longOrder.order_id,
      match_id: matchId,
      counterparty_order_id: shortOrder.order_id,
      fill_size: matchSize.toString(),
      fill_price: matchPrice.toString(),
      tx_hash: txHash,
    });

    await orderHelpers.recordFill(this.pool, {
      order_id: shortOrder.order_id,
      match_id: matchId,
      counterparty_order_id: longOrder.order_id,
      fill_size: matchSize.toString(),
      fill_price: matchPrice.toString(),
      tx_hash: txHash,
    });

    // Log history
    await orderHelpers.logOrderHistory(this.pool, longOrder.order_id, 'matched', {
      matchId,
      counterparty: shortOrder.order_id,
      size: matchSize,
      price: matchPrice,
      status: longStatus,
    });

    await orderHelpers.logOrderHistory(this.pool, shortOrder.order_id, 'matched', {
      matchId,
      counterparty: longOrder.order_id,
      size: matchSize,
      price: matchPrice,
      status: shortStatus,
    });
  }

  /**
   * Match orders for all active markets
   */
  async matchAllMarkets(): Promise<void> {
    if (this.isRunning) {
      console.log('[OrderMatching] Already running, skipping...');
      return;
    }

    this.isRunning = true;

    try {
      // Get all active markets from database
      const result = await this.pool.query(
        'SELECT DISTINCT market_id FROM perp_orders WHERE status IN ($1, $2)',
        ['pending', 'partial']
      );

      const markets = result.rows.map(r => r.market_id);

      if (markets.length === 0) {
        console.log('[OrderMatching] No markets with pending orders');
        return;
      }

      console.log(`[OrderMatching] Checking ${markets.length} markets for matches...`);

      let totalMatches = 0;
      for (const marketId of markets) {
        const matches = await this.matchOrdersForMarket(marketId);
        totalMatches += matches.length;
      }

      if (totalMatches > 0) {
        console.log(`[OrderMatching] Completed ${totalMatches} matches`);
      }
    } catch (error) {
      console.error('[OrderMatching] Error in matchAllMarkets:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Start the matching engine (runs periodically)
   */
  start(intervalSeconds: number = 10): NodeJS.Timeout {
    console.log(`[OrderMatching] Starting matching engine (interval: ${intervalSeconds}s)`);
    
    // Run immediately
    this.matchAllMarkets();

    // Then run on interval
    return setInterval(() => {
      this.matchAllMarkets();
    }, intervalSeconds * 1000);
  }
}

// Singleton instance
let matchingEngineInstance: OrderMatchingEngine | null = null;

export function initializeMatchingEngine(pool: Pool, intervalSeconds: number = 10): OrderMatchingEngine {
  if (matchingEngineInstance) {
    console.log('[OrderMatching] Already initialized');
    return matchingEngineInstance;
  }

  matchingEngineInstance = new OrderMatchingEngine(pool);
  matchingEngineInstance.start(intervalSeconds);
  return matchingEngineInstance;
}

export function getMatchingEngine(): OrderMatchingEngine | null {
  return matchingEngineInstance;
}
