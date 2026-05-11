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
        await pool.query(
          `INSERT INTO perps_tokens
             (symbol, name, uuid, token_address, pair_standard, min_leverage, max_leverage,
              min_position_size, max_position_size, maintenance_margin, funding_rate_coefficient,
              is_active, icon_url)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,$12)
           ON CONFLICT (symbol) DO UPDATE SET
             name = EXCLUDED.name,
             updated_at = NOW()`,
          [
            symbol, name,
            body.uuid ?? null,
            null, // token_address — not needed for perps (contract is the PerpEngine)
            `${symbol}USDC`,
            body.minLeverage ?? 1,
            body.maxLeverage ?? 50,
            body.minPositionSize ?? 10,
            body.maxPositionSize ?? 1_000_000,
            body.maintenanceMarginBps ? body.maintenanceMarginBps / 10000 : 0.0075,
            body.fundingRateCoefficient ?? 0.0001,
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
           VALUES ($1,$2,$3,'USDC',true,$4)
           ON CONFLICT (symbol) DO UPDATE SET
             name = EXCLUDED.name,
             updated_at = NOW()`,
          [symbol, name, null, body.iconUrl ?? null]
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
           VALUES ($1,$2,$3,'CALL',true,$4)
           ON CONFLICT (symbol) DO UPDATE SET
             name = EXCLUDED.name,
             updated_at = NOW()`,
          [`${symbol}-UNDERLYING`, name, symbol, body.iconUrl ?? null]
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

        // ── 3. Set oracle price if provided ──────────────────────────────────
        if (body.initialPriceUsd && body.initialPriceUsd > 0) {
          try {
            const oracleTx = await svc.setOraclePriceForFeed(feedId, body.initialPriceUsd);
            results.perps = { ...results.perps, oracle: { status: "price set", txHash: oracleTx } };
          } catch (oErr: any) {
            results.perps = { ...results.perps, oracle: { status: "warning", error: oErr.message } };
          }
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
