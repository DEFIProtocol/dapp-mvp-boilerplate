/**
 * Admin market registration route.
 * POST /api/admin/markets/register
 *   - Inserts the market into DB tables for each requested domain
 *   - Calls PerpStorage.addMarketAdmin on-chain
 *   - Sets the MockOracle price for the feedId on testnet
 *
 * GET /api/admin/markets
 *   - Returns all markets from DB across all domains
 */
import { Router } from "express";
import { Pool } from "pg";
import { ethers } from "ethers";
import { SettlementService } from "./settlementService";
import { globalPriceStore } from "../../utils/globalPriceStore";

export type Domain = "perps" | "options" | "spot";

export interface RegisterMarketRequest {
  symbol: string;           // e.g. "BTC"
  name: string;             // e.g. "Bitcoin"
  feedId?: string;          // bytes32 hex — defaults to encodeBytes32String("{symbol}/USD")
  initialPriceUsd?: number; // Set MockOracle price for this feed (testnet only)
  domains: Domain[];        // which domains to register in DB
  // Perp-specific (with defaults)
  makerFeeBps?: number;
  takerFeeBps?: number;
  maintenanceMarginBps?: number;
  liquidationRewardBps?: number;
  liquidationPenaltyBps?: number;
  // DB metadata
  iconUrl?: string;
  uuid?: string;
  minLeverage?: number;
  maxLeverage?: number;
  minPositionSize?: number;
  maxPositionSize?: number;
  fundingRateCoefficient?: number;
}

export function adminMarketsRouter(pool: Pool): Router {
  const router = Router();

  /**
   * GET /api/admin/markets
   * Returns all markets across perps, spot, options DB tables.
   */
  router.get("/", async (_req, res) => {
    try {
      const [perps, spot, options] = await Promise.all([
        pool.query("SELECT * FROM perps_tokens ORDER BY symbol").catch(() => ({ rows: [] })),
        pool.query("SELECT * FROM spot_tokens ORDER BY symbol").catch(() => ({ rows: [] })),
        pool.query("SELECT * FROM options_tokens ORDER BY symbol").catch(() => ({ rows: [] })),
      ]);

      res.json({
        success: true,
        markets: {
          perps: perps.rows,
          spot: spot.rows,
          options: options.rows,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/admin/markets/migrate-perp-addresses
   * Updates all existing perp markets with the PerpStorage contract address
   */
  router.post("/migrate-perp-addresses", async (_req, res) => {
    try {
      const perpStorageAddress = process.env.PERP_STORAGE_ADDRESS || '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0';
      
      const result = await pool.query(
        `UPDATE perps_tokens 
         SET token_address = $1, updated_at = NOW() 
         WHERE token_address IS NULL OR token_address = ''`,
        [perpStorageAddress]
      );

      res.json({
        success: true,
        message: `Updated ${result.rowCount} perp market(s) with PerpStorage address`,
        address: perpStorageAddress,
        updatedCount: result.rowCount
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * PATCH /api/admin/markets/:domain/:symbol/toggle
   * Toggle active status for any market type
   */
  router.patch("/:domain/:symbol/toggle", async (req, res) => {
    try {
      const { domain, symbol } = req.params;
      const { isActive } = req.body;

      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ success: false, error: "isActive boolean required" });
      }

      let tableName: string;
      if (domain === 'perps') tableName = 'perps_tokens';
      else if (domain === 'spot') tableName = 'spot_tokens';
      else if (domain === 'options') tableName = 'options_tokens';
      else return res.status(400).json({ success: false, error: "Invalid domain" });

      const result = await pool.query(
        `UPDATE ${tableName} 
         SET is_active = $1, updated_at = NOW() 
         WHERE LOWER(symbol) = LOWER($2) 
         RETURNING *`,
        [isActive, symbol]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ success: false, error: "Market not found" });
      }

      res.json({ success: true, market: result.rows[0] });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * DELETE /api/admin/markets/:domain/:symbol
   * Delete a market from any domain
   */
  router.delete("/:domain/:symbol", async (req, res) => {
    try {
      const { domain, symbol } = req.params;

      let tableName: string;
      if (domain === 'perps') tableName = 'perps_tokens';
      else if (domain === 'spot') tableName = 'spot_tokens';
      else if (domain === 'options') tableName = 'options_tokens';
      else return res.status(400).json({ success: false, error: "Invalid domain" });

      const result = await pool.query(
        `DELETE FROM ${tableName} 
         WHERE LOWER(symbol) = LOWER($1) 
         RETURNING *`,
        [symbol]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ success: false, error: "Market not found" });
      }

      res.json({ 
        success: true, 
        message: `${domain} market deleted`, 
        deleted: result.rows[0] 
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/admin/markets/register
   * Registers a new market on-chain and in DB.
   */
  router.post("/register", async (req, res) => {
    const body = req.body as RegisterMarketRequest;

    if (!body.symbol || !body.name || !body.domains?.length) {
      res.status(400).json({ success: false, error: "symbol, name, and at least one domain are required" });
      return;
    }

    const symbol = body.symbol.trim().toUpperCase();
    const name = body.name.trim();
    const feedId = body.feedId?.trim() || ethers.encodeBytes32String(`${symbol}/USD`);

    // Validate feedId is a valid bytes32
    if (!/^0x[0-9a-fA-F]{64}$/.test(feedId)) {
      res.status(400).json({ success: false, error: "feedId must be a 0x-prefixed 64-char hex string" });
      return;
    }

    const domains: Domain[] = body.domains;
    const results: Record<string, any> = {};

    // ── 1. DB inserts ────────────────────────────────────────────────────────
    if (domains.includes("perps")) {
      try {
        // Use PerpStorage contract address for all perp markets
        const perpStorageAddress = process.env.PERP_STORAGE_ADDRESS || '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0';
        
        await pool.query(
          `INSERT INTO perps_tokens
             (symbol, name, uuid, token_address, pair_standard, min_leverage, max_leverage,
              min_position_size, max_position_size, maintenance_margin, funding_rate_coefficient,
              is_active, icon_url)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           ON CONFLICT (symbol) DO UPDATE SET
             name = EXCLUDED.name,
             uuid = EXCLUDED.uuid,
             token_address = EXCLUDED.token_address,
             pair_standard = EXCLUDED.pair_standard,
             min_leverage = EXCLUDED.min_leverage,
             max_leverage = EXCLUDED.max_leverage,
             min_position_size = EXCLUDED.min_position_size,
             max_position_size = EXCLUDED.max_position_size,
             maintenance_margin = EXCLUDED.maintenance_margin,
             funding_rate_coefficient = EXCLUDED.funding_rate_coefficient,
             icon_url = EXCLUDED.icon_url,
             updated_at = NOW()`,
          [
            symbol,
            name,
            body.uuid ?? null,
            perpStorageAddress, // PerpStorage contract address - shared by all perp markets
            `${symbol}USDC`,
            body.minLeverage ?? 1,
            body.maxLeverage ?? 50,
            body.minPositionSize ?? 10,
            body.maxPositionSize ?? 1_000_000,
            body.maintenanceMarginBps ? body.maintenanceMarginBps / 10000 : 0.0075,
            body.fundingRateCoefficient ?? 0.0001,
            true, // is_active
            body.iconUrl ?? null,
          ]
        );
        results.perps = { db: "ok" };
      } catch (err: any) {
        results.perps = { db: `error: ${err.message}` };
      }
    }

    if (domains.includes("spot")) {
      try {
        await pool.query(
          `INSERT INTO spot_tokens
             (symbol, name, token_address, quote_asset, is_active, icon_url)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (symbol) DO UPDATE SET
             name = EXCLUDED.name,
             token_address = EXCLUDED.token_address,
             quote_asset = EXCLUDED.quote_asset,
             icon_url = EXCLUDED.icon_url,
             updated_at = NOW()`,
          [symbol, name, null, 'USDC', true, body.iconUrl ?? null]
        );
        results.spot = { db: "ok" };
      } catch (err: any) {
        results.spot = { db: `error: ${err.message}` };
      }
    }

    if (domains.includes("options")) {
      try {
        // Register the underlying asset — options series are created separately
        await pool.query(
          `INSERT INTO options_tokens
             (symbol, name, underlying_symbol, option_type, is_active, icon_url)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (symbol) DO UPDATE SET
             name = EXCLUDED.name,
             underlying_symbol = EXCLUDED.underlying_symbol,
             option_type = EXCLUDED.option_type,
             icon_url = EXCLUDED.icon_url,
             updated_at = NOW()`,
          [`${symbol}-UNDERLYING`, name, symbol, 'CALL', true, body.iconUrl ?? null]
        );
        results.options = { db: "ok" };
      } catch (err: any) {
        results.options = { db: `error: ${err.message}` };
      }
    }

    // ── 2. On-chain registration (only for perps domain) ────────────────────
    // Only perps need the on-chain market registry. Spot/options settle off-chain via DB.
    if (domains.includes("perps")) {
      try {
        const svc = new SettlementService();
        const marketId = feedId; // convention: marketId === feedId

        const txHash = await svc.addMarket({
          marketId,
          feedId,
          makerFeeBps: body.makerFeeBps ?? 5,
          takerFeeBps: body.takerFeeBps ?? 10,
          maintenanceMarginBps: body.maintenanceMarginBps ?? 75,
          liquidationRewardBps: body.liquidationRewardBps ?? 80,
          liquidationPenaltyBps: body.liquidationPenaltyBps ?? 150,
        });
        results.perps = { ...results.perps, onChain: { status: "registered", txHash } };

        // ── 3. Auto-fetch current price and set oracle ──────────────────────
        try {
          let priceToSet = body.initialPriceUsd;
          
          // If no price provided, fetch from globalPriceStore
          if (!priceToSet || priceToSet <= 0) {
            const allPrices = globalPriceStore.getAllPrices();
            const priceEntry = allPrices.find(p => p.symbol.toUpperCase() === symbol);
            
            if (priceEntry && priceEntry.price > 0) {
              priceToSet = priceEntry.price;
              console.log(`[AdminMarkets] Auto-fetched ${symbol} price from globalPriceStore: $${priceToSet}`);
            } else {
              console.warn(`[AdminMarkets] No price found for ${symbol} in globalPriceStore`);
            }
          }
          
          // Set oracle price if we have a valid price
          if (priceToSet && priceToSet > 0) {
            const oracleTx = await svc.setOraclePriceForFeed(feedId, priceToSet);
            results.perps = { 
              ...results.perps, 
              oracle: { 
                status: "price set", 
                txHash: oracleTx,
                price: priceToSet,
                source: body.initialPriceUsd ? "manual" : "auto-fetched"
              } 
            };
          } else {
            results.perps = { 
              ...results.perps, 
              oracle: { 
                status: "warning", 
                error: "No price available - oracle not initialized" 
              } 
            };
          }
        } catch (oErr: any) {
          results.perps = { ...results.perps, oracle: { status: "error", error: oErr.message } };
        }
      } catch (err: any) {
        // On-chain failed — log but don't fail the whole request since DB already succeeded
        if (results.perps) {
          results.perps = { ...results.perps, onChain: { status: "error", error: err.message } };
        }
      }
    }

    res.json({
      success: true,
      symbol,
      feedId,
      domains,
      results,
    });
  });

  return router;
}
