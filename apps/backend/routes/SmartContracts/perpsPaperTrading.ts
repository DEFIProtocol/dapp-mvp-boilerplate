import express from "express";
import { ethers, isAddress } from "ethers";
import { Pool } from "pg";
import { SettlementService } from "./settlementService";
import * as perpsHelpers from "../../postgres/perps";
import * as orderHelpers from "../../postgres/perpOrders";
import { ensurePaperTradingChain, parseNumeric } from "./paperTradingGuards";

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

const orderIntentStore = new Map<string, OrderIntent[]>();

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

function getOrderIntentsForTrader(trader: string): OrderIntent[] {
  return orderIntentStore.get(trader.toLowerCase()) ?? [];
}

function pushOrderIntent(intent: OrderIntent) {
  const key = intent.trader.toLowerCase();
  const existing = orderIntentStore.get(key) ?? [];
  existing.unshift(intent);
  orderIntentStore.set(key, existing.slice(0, 50));
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

      // Also keep in memory for backward compatibility
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

      pushOrderIntent(intent);

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

      const intents = getOrderIntentsForTrader(trader).filter((intent) => {
        if (symbol && intent.symbol !== symbol.toUpperCase()) return false;
        if (marketId && intent.marketId.toLowerCase() !== marketId.toLowerCase()) return false;
        if (subAccountId && intent.subAccountId !== subAccountId) return false;
        return true;
      });

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
