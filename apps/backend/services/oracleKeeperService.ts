/**
 * Oracle Keeper Service
 * 
 * Continuously updates the Oracle contract with real-time prices from globalPriceStore.
 * This keeps the TWAP engine fed with fresh observations and ensures mark prices stay current.
 */

import { Pool } from 'pg';
import { globalPriceStore } from '../utils/globalPriceStore';
import { SettlementService } from '../routes/SmartContracts/settlementService';
import { ethers } from 'ethers';

export class OracleKeeperService {
  private pool: Pool;
  private intervalId: NodeJS.Timeout | null = null;
  private updateIntervalMs: number;
  private isRunning: boolean = false;

  constructor(pool: Pool, updateIntervalSeconds: number = 30) {
    this.pool = pool;
    this.updateIntervalMs = updateIntervalSeconds * 1000;
  }

  /**
   * Start the keeper service
   */
  start() {
    if (this.isRunning) {
      console.log('[OracleKeeper] Already running');
      return;
    }

    console.log(`[OracleKeeper] Starting keeper service (update interval: ${this.updateIntervalMs / 1000}s)`);
    this.isRunning = true;

    // Run immediately on start
    this.updateOraclePrices();

    // Then run on interval
    this.intervalId = setInterval(() => {
      this.updateOraclePrices();
    }, this.updateIntervalMs);
  }

  /**
   * Stop the keeper service
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('[OracleKeeper] Stopped');
  }

  /**
   * Update oracle prices for all active perp markets
   */
  private async updateOraclePrices() {
    try {
      // Get all active perp markets from database
      const result = await this.pool.query(
        'SELECT symbol, pair_standard FROM perps_tokens WHERE is_active = true'
      );

      if (result.rows.length === 0) {
        console.log('[OracleKeeper] No active perp markets found');
        return;
      }

      console.log(`[OracleKeeper] Updating prices for ${result.rows.length} markets...`);

      // Get all prices from globalPriceStore
      const allPrices = globalPriceStore.getAllPrices();
      const priceMap = new Map(allPrices.map(p => [p.symbol.toUpperCase(), p.price]));

      // Initialize settlement service once
      const svc = new SettlementService();
      let successCount = 0;
      let errorCount = 0;

      // Update each market
      for (const market of result.rows) {
        const symbol = market.symbol.toUpperCase();
        const price = priceMap.get(symbol);

        if (!price || price <= 0) {
          console.warn(`[OracleKeeper] No price available for ${symbol}, skipping`);
          errorCount++;
          continue;
        }

        try {
          // Generate feedId (same as in adminMarkets.ts)
          const feedId = ethers.encodeBytes32String(`${symbol}/USD`);

          // Update oracle
          await svc.setOraclePriceForFeed(feedId, price);
          successCount++;
          
          console.log(`[OracleKeeper] ✓ Updated ${symbol}: $${price.toFixed(2)}`);
        } catch (err: any) {
          console.error(`[OracleKeeper] ✗ Failed to update ${symbol}:`, err.message);
          errorCount++;
        }
      }

      console.log(`[OracleKeeper] Update complete: ${successCount} success, ${errorCount} errors`);
    } catch (err: any) {
      console.error('[OracleKeeper] Error in update cycle:', err.message);
    }
  }

  /**
   * Manually trigger an update (useful for testing)
   */
  async triggerUpdate() {
    console.log('[OracleKeeper] Manual update triggered');
    await this.updateOraclePrices();
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      updateIntervalSeconds: this.updateIntervalMs / 1000,
    };
  }
}

// Singleton instance
let keeperInstance: OracleKeeperService | null = null;

export function initializeOracleKeeper(pool: Pool, updateIntervalSeconds: number = 30) {
  if (keeperInstance) {
    console.log('[OracleKeeper] Already initialized');
    return keeperInstance;
  }

  keeperInstance = new OracleKeeperService(pool, updateIntervalSeconds);
  keeperInstance.start();
  return keeperInstance;
}

export function getOracleKeeper(): OracleKeeperService | null {
  return keeperInstance;
}
