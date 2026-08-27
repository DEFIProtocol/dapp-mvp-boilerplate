import express from "express";
import { ethers, isAddress } from "ethers";
import { Pool } from "pg";
import { SettlementService } from "./settlementService";
import * as perpsHelpers from "../../postgres/perps";
import * as orderHelpers from "../../postgres/perpOrders";
import { ensurePaperTradingChain, parseNumeric, parseBigNumeric } from "./paperTradingGuards";

type OrderSide = "LONG" | "SHORT";
type OrderType = "market" | "limit";

type OrderIntent = {
  id: string;
  createdAt: string;
  symbol: string;
  marketId: string;
  subAccountId?: string;
  perpAddress: string;
  trader: string;
  side: OrderSide;
  orderType: OrderType;
  exposureUsd: number;
  leverage: number;
  limitPrice?: number;
  status: "queued";
};

function getSettlementService() {
  try {
    return { settlement: new SettlementService() };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to initialize settlement service",
    };
  }
}

function resolveMarketId(symbol: string, provided?: string): string {
  if (provided && /^0x[a-fA-F0-9]{64}$/.test(provided)) {
    return provided;
  }

  return ethers.encodeBytes32String(`${symbol.toUpperCase()}/USD`);
}

/**
 * Map a Postgres perp_orders row (the real source of truth, also consumed
 * by the order matching engine) into the PendingPerpOrder shape the
 * frontend already expects from earlier in-memory-store days.
 */
function toOrderIntent(row: orderHelpers.PerpOrder): OrderIntent {
  return {
    id: row.order_id,
    createdAt: new Date(row.created_at).toISOString(),
    symbol: row.symbol,
    marketId: row.market_id,
    perpAddress: row.symbol, // resolved by caller when a token lookup is available
    trader: row.trader_address,
    side: row.side,
    orderType: row.order_type,
    exposureUsd: Number(row.remaining_size),
    leverage: Number(row.leverage),
    limitPrice: row.limit_price != null ? Number(row.limit_price) : undefined,
    status: "queued",
  };
}

export default function perpsPaperTradingRouter(pool: Pool) {
  const router = express.Router();

  router.post("/orders", async (req, res) => {
    const { settlement, error } = getSettlementService();
    if (!settlement) {
      return res.status(503).json({ success: false, error });
    }

    try {
      const {
        chainId,
        symbol,
        marketId,
        subAccountId,
        perpAddress,
        trader,
        side,
        orderType,
        exposureUsd,
        leverage,
        limitPrice,
        expiry,
        nonce,
        signature,
      } = req.body ?? {};

      const chainGuard = ensurePaperTradingChain(chainId);
      if (!chainGuard.ok) {
        return res.status(400).json({ success: false, error: chainGuard.message });
      }

      if (typeof symbol !== "string" || symbol.trim().length === 0) {
        return res.status(400).json({ success: false, error: "symbol is required" });
      }

      if (typeof perpAddress !== "string" || !isAddress(perpAddress)) {
        return res.status(400).json({ success: false, error: "perpAddress must be a valid EVM address" });
      }

      if (typeof trader !== "string" || !isAddress(trader)) {
        return res.status(400).json({ success: false, error: "trader must be a valid EVM address" });
      }

      if (side !== "LONG" && side !== "SHORT") {
        return res.status(400).json({ success: false, error: "side must be LONG or SHORT" });
      }

      if (orderType !== "market" && orderType !== "limit") {
        return res.status(400).json({ success: false, error: "orderType must be market or limit" });
      }

      const exposureValue = parseNumeric(exposureUsd);
      const leverageValue = parseNumeric(leverage);
      const limitPriceValue = limitPrice === undefined ? undefined : parseNumeric(limitPrice);

      if (exposureValue === null || exposureValue <= 0) {
        return res.status(400).json({ success: false, error: "exposureUsd must be a positive number" });
      }

      if (leverageValue === null || leverageValue < 1 || leverageValue > 100) {
        return res.status(400).json({ success: false, error: "leverage must be between 1 and 100" });
      }

      if (orderType === "limit" && (limitPriceValue == null || Number(limitPriceValue) <= 0)) {
        return res.status(400).json({ success: false, error: "limitPrice must be a positive number for limit orders" });
      }

      if (typeof signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(signature)) {
        return res.status(400).json({ success: false, error: "signature must be a valid 65-byte EIP-712 signature" });
      }

      const expiryValue = parseNumeric(expiry);
      if (expiryValue === null || expiryValue <= Math.floor(Date.now() / 1000)) {
        return res.status(400).json({ success: false, error: "expiry must be a future unix timestamp" });
      }

      // Nonces are generated client-side as bigint millisecond timestamps
      // and sent as numeric strings to avoid precision loss beyond
      // Number.MAX_SAFE_INTEGER, so they can't be validated with the
      // plain-number parseNumeric() used for the other numeric fields.
      const nonceValue = parseBigNumeric(nonce);
      if (nonceValue === null) {
        return res.status(400).json({ success: false, error: "nonce must be a non-negative integer" });
      }

      const perpToken = await perpsHelpers.getPerpsTokenBySymbol(pool, symbol);
      if (!perpToken) {
        return res.status(404).json({ success: false, error: `Unknown perp symbol: ${symbol}` });
      }

      if (!perpToken.token_address) {
        return res.status(400).json({ success: false, error: `No token_address configured for ${symbol}` });
      }

      if (perpToken.token_address.toLowerCase() !== perpAddress.toLowerCase()) {
        return res.status(400).json({
          success: false,
          error: `perpAddress does not match configured token_address for ${symbol}`,
        });
      }

      const markPrice = await settlement.getMarkPrice();
      const resolvedMarketId = resolveMarketId(symbol, typeof marketId === "string" ? marketId : undefined);
      const orderId = ethers.id(`${trader}-${Date.now()}-${Math.random()}`);

      // Save order to database
      const dbOrder = await orderHelpers.createOrder(pool, {
        order_id: orderId,
        trader_address: trader.toLowerCase(),
        symbol: symbol.toUpperCase(),
        market_id: resolvedMarketId,
        side,
        order_type: orderType,
        original_size: exposureValue.toString(),
        remaining_size: exposureValue.toString(),
        filled_size: '0',
        leverage: leverageValue.toString(),
        limit_price: limitPriceValue?.toString(),
        status: orderType === 'market' ? 'pending' : 'pending',
        expiry: expiryValue.toString(),
        nonce: nonceValue,
        signature,
      });

      // Log order creation
      await orderHelpers.logOrderHistory(pool, orderId, 'created', {
        symbol: symbol.toUpperCase(),
        side,
        orderType,
        exposureUsd: exposureValue,
        leverage: leverageValue,
        limitPrice: limitPriceValue,
      });

      // Response shape kept identical to the pre-existing PendingPerpOrder
      // contract the frontend already expects (order is now durably
      // persisted in Postgres via orderHelpers.createOrder above, and is
      // what the OrderMatchingEngine actually reads from to settle on-chain).
      const intent: OrderIntent = {
        id: orderId,
        createdAt: dbOrder.created_at,
        symbol: symbol.toUpperCase(),
        marketId: resolvedMarketId,
        subAccountId: typeof subAccountId === "string" ? subAccountId : undefined,
        perpAddress,
        trader,
        side,
        orderType,
        exposureUsd: exposureValue,
        leverage: leverageValue,
        limitPrice: limitPriceValue === null ? undefined : limitPriceValue,
        status: "queued",
      };

      res.json({
        success: true,
        order: {
          ...intent,
          dbOrderId: dbOrder.id,
        },
        onChain: {
          markPrice: markPrice.toString(),
          markPriceUsd: Number(markPrice) / 1e18,
          engineExecution: orderType === 'market' ? 'immediate' : 'queued-for-matching',
          note: orderType === 'market' 
            ? "Market order will execute immediately at current price"
            : "Limit order saved to database and will be matched when price conditions are met.",
        },
      });
    } catch (routeError) {
      console.error("Error creating order intent:", routeError);
      res.status(500).json({
        success: false,
        error: routeError instanceof Error ? routeError.message : "Unknown error",
      });
    }
  });

  router.get("/positions/:trader", async (req, res) => {
    const { settlement, error } = getSettlementService();
    if (!settlement) {
      return res.status(503).json({ success: false, error });
    }

    try {
      const { trader } = req.params;
      const chainId = req.query.chainId;
      const symbol = typeof req.query.symbol === "string" ? req.query.symbol : undefined;
      const marketId = typeof req.query.marketId === "string" ? req.query.marketId : undefined;
      const subAccountId = typeof req.query.subAccountId === "string" ? req.query.subAccountId : undefined;
      const perpAddress = typeof req.query.perpAddress === "string" ? req.query.perpAddress : undefined;

      const chainGuard = ensurePaperTradingChain(chainId);
      if (!chainGuard.ok) {
        return res.status(400).json({ success: false, error: chainGuard.message });
      }

      if (!isAddress(trader)) {
        return res.status(400).json({ success: false, error: "trader must be a valid EVM address" });
      }

      let tokenAddress: string | undefined;
      if (symbol) {
        const perpToken = await perpsHelpers.getPerpsTokenBySymbol(pool, symbol);
        if (!perpToken) {
          return res.status(404).json({ success: false, error: `Unknown perp symbol: ${symbol}` });
        }

        if (!perpToken.token_address) {
          return res.status(400).json({ success: false, error: `No token_address configured for ${symbol}` });
        }

        tokenAddress = perpToken.token_address;

        if (perpAddress && tokenAddress.toLowerCase() !== perpAddress.toLowerCase()) {
          return res.status(400).json({
            success: false,
            error: `perpAddress does not match configured token_address for ${symbol}`,
          });
        }
      }

      const [positions, markPrice] = await Promise.all([
        settlement.getTraderPositionSnapshots(trader, { marketId, subAccountId }),
        settlement.getMarkPrice(),
      ]);

      const pendingOrderRows = await orderHelpers.getOrdersByTrader(pool, trader.toLowerCase());
      const intents = pendingOrderRows
        .filter((order) => order.status === "pending" || order.status === "partial")
        .filter((order) => {
          if (symbol && order.symbol !== symbol.toUpperCase()) return false;
          if (marketId && order.market_id.toLowerCase() !== marketId.toLowerCase()) return false;
          return true;
        })
        .map((order) => ({ ...toOrderIntent(order), perpAddress: perpAddress ?? tokenAddress ?? order.symbol }));

      res.json({
        success: true,
        trader,
        symbol: symbol?.toUpperCase(),
        marketId,
        subAccountId,
        perpAddress: perpAddress ?? tokenAddress,
        markPrice: markPrice.toString(),
        markPriceUsd: Number(markPrice) / 1e18,
        positions,
        pendingOrders: intents,
      });
    } catch (routeError) {
      console.error("Error fetching trader positions:", routeError);
      res.status(500).json({
        success: false,
        error: routeError instanceof Error ? routeError.message : "Unknown error",
      });
    }
  });

  // Contract addresses/chain info the frontend needs to build the EIP-712
  // domain for order signing (SettlementEngine verifies OrderLib signatures).
  // NOTE: this must be registered before "/orders/:trader" below, otherwise
  // Express matches "config" as the :trader param and 400s before this
  // handler is ever reached.
  router.get("/orders/config", async (_req, res) => {
    const { settlement, error } = getSettlementService();
    if (!settlement) {
      return res.status(503).json({ success: false, error });
    }

    try {
      const addresses = settlement.getContractAddresses();
      res.json({ success: true, ...addresses });
    } catch (routeError) {
      console.error("Error fetching order signing config:", routeError);
      res.status(500).json({
        success: false,
        error: routeError instanceof Error ? routeError.message : "Unknown error",
      });
    }
  });

  // Get orders for a trader
  router.get("/orders/:trader", async (req, res) => {
    try {
      const { trader } = req.params;
      const status = typeof req.query.status === "string" ? req.query.status : undefined;

      if (!isAddress(trader)) {
        return res.status(400).json({ success: false, error: "trader must be a valid EVM address" });
      }

      const orders = await orderHelpers.getOrdersByTrader(pool, trader.toLowerCase(), status);

      res.json({
        success: true,
        trader,
        orders,
      });
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Cancel an order
  router.delete("/orders/:orderId", async (req, res) => {
    try {
      const { orderId } = req.params;

      const cancelled = await orderHelpers.cancelOrder(pool, orderId);

      if (!cancelled) {
        return res.status(404).json({
          success: false,
          error: "Order not found or already filled/cancelled",
        });
      }

      // Log cancellation
      await orderHelpers.logOrderHistory(pool, orderId, 'cancelled', {
        cancelledAt: new Date().toISOString(),
      });

      res.json({
        success: true,
        orderId,
        status: 'cancelled',
      });
    } catch (error) {
      console.error("Error cancelling order:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Get order history for a trader
  router.get("/history/:trader", async (req, res) => {
    try {
      const { trader } = req.params;
      const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit) : 50;

      if (!isAddress(trader)) {
        return res.status(400).json({ success: false, error: "trader must be a valid EVM address" });
      }

      const history = await orderHelpers.getOrderHistory(pool, trader.toLowerCase(), limit);

      res.json({
        success: true,
        trader,
        history,
      });
    } catch (error) {
      console.error("Error fetching order history:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Admin monitoring: every open order across all traders (Postgres, the
  // same table the matching engine reads from).
  router.get("/admin/orders", async (req, res) => {
    try {
      const statusParam = typeof req.query.status === "string" ? req.query.status : undefined;
      const statuses = statusParam ? statusParam.split(",").map((s) => s.trim()) : undefined;
      const limit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 200;

      const orders = await orderHelpers.getAllOrders(pool, statuses, Number.isFinite(limit) ? limit : 200);

      res.json({ success: true, orders });
    } catch (routeError) {
      console.error("Error fetching admin order list:", routeError);
      res.status(500).json({
        success: false,
        error: routeError instanceof Error ? routeError.message : "Unknown error",
      });
    }
  });

  // Admin monitoring: every position that exists on-chain right now
  // (PerpStorage, walked by positionId), split into open/closed.
  router.get("/admin/positions", async (_req, res) => {
    const { settlement, error } = getSettlementService();
    if (!settlement) {
      return res.status(503).json({ success: false, error });
    }

    try {
      const positions = await settlement.getAllPositionsFromChain();
      res.json({
        success: true,
        open: positions.filter((p) => p.active),
        closed: positions.filter((p) => !p.active),
      });
    } catch (routeError) {
      console.error("Error fetching admin position list:", routeError);
      res.status(500).json({
        success: false,
        error: routeError instanceof Error ? routeError.message : "Unknown error",
      });
    }
  });

  // Admin monitoring: realized PnL history sourced from PositionClosed events.
  router.get("/admin/closed-positions", async (req, res) => {
    const { settlement, error } = getSettlementService();
    if (!settlement) {
      return res.status(503).json({ success: false, error });
    }

    try {
      const fromBlock = typeof req.query.fromBlock === "string" ? parseInt(req.query.fromBlock, 10) : undefined;
      const closed = await settlement.getClosedPositionsFromChain(fromBlock);
      res.json({ success: true, closed });
    } catch (routeError) {
      console.error("Error fetching closed position history:", routeError);
      res.status(500).json({
        success: false,
        error: routeError instanceof Error ? routeError.message : "Unknown error",
      });
    }
  });

  router.get("/params", async (_req, res) => {
    const { settlement, error } = getSettlementService();
    if (!settlement) {
      return res.status(503).json({ success: false, error });
    }

    try {
      const params = await settlement.getParams();
      res.json({ success: true, params });
    } catch (routeError) {
      console.error("Error fetching settlement params:", routeError);
      res.status(500).json({
        success: false,
        error: routeError instanceof Error ? routeError.message : "Unknown error",
      });
    }
  });

  router.post("/params", async (req, res) => {
    const { settlement, error } = getSettlementService();
    if (!settlement) {
      return res.status(503).json({ success: false, error });
    }

    try {
      const {
        makerFeeBps,
        takerFeeBps,
        insuranceBps,
        maintenanceMarginBps,
        liquidationRewardBps,
        liquidationPenaltyBps,
      } = req.body;

      const values = [
        makerFeeBps,
        takerFeeBps,
        insuranceBps,
        maintenanceMarginBps,
        liquidationRewardBps,
        liquidationPenaltyBps,
      ];

      if (values.some((value) => typeof value !== "number" || Number.isNaN(value))) {
        return res.status(400).json({
          success: false,
          error: "All params must be numeric values",
        });
      }

      if (liquidationRewardBps > liquidationPenaltyBps) {
        return res.status(400).json({
          success: false,
          error: "liquidationRewardBps cannot exceed liquidationPenaltyBps",
        });
      }

      const [feeTxHash, riskTxHash] = await Promise.all([
        settlement.setFeeParams(makerFeeBps, takerFeeBps, insuranceBps),
        settlement.setRiskParams(
          maintenanceMarginBps,
          liquidationRewardBps,
          liquidationPenaltyBps
        ),
      ]);

      const updated = await settlement.getParams();

      res.json({
        success: true,
        tx: {
          feeTxHash,
          riskTxHash,
        },
        params: updated,
      });
    } catch (routeError) {
      console.error("Error updating settlement params:", routeError);
      res.status(500).json({
        success: false,
        error: routeError instanceof Error ? routeError.message : "Unknown error",
      });
    }
  });

  return router;
}
