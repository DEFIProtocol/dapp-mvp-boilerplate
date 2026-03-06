import express from "express";
import { isAddress } from "ethers";
import { Pool } from "pg";
import { SettlementService } from "./SmartContracts/settlementService";
import * as perpsHelpers from "../postgres/perps";

type OrderSide = "LONG" | "SHORT";
type OrderType = "market" | "limit";

type OrderIntent = {
  id: string;
  createdAt: string;
  symbol: string;
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

function parseNumeric(input: unknown): number | null {
  if (typeof input !== "number" || Number.isNaN(input)) return null;
  return input;
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

export default function smartContractsRouter(pool: Pool) {
  const router = express.Router();

  router.post("/orders", async (req, res) => {
    const { settlement, error } = getSettlementService();
    if (!settlement) {
      return res.status(503).json({ success: false, error });
    }

    try {
      const {
        symbol,
        perpAddress,
        trader,
        side,
        orderType,
        exposureUsd,
        leverage,
        limitPrice,
      } = req.body ?? {};

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

      if (orderType === "limit" && (limitPriceValue === null || limitPriceValue <= 0)) {
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

      const intent: OrderIntent = {
        id: `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
        createdAt: new Date().toISOString(),
        symbol: symbol.toUpperCase(),
        perpAddress,
        trader,
        side,
        orderType,
        exposureUsd: exposureValue,
        leverage: leverageValue,
        limitPrice: limitPriceValue,
        status: "queued",
      };

      pushOrderIntent(intent);

      res.json({
        success: true,
        order: intent,
        onChain: {
          markPrice: markPrice.toString(),
          markPriceUsd: Number(markPrice) / 1e18,
          engineExecution: "queued-for-matching",
          note: "Order intent is accepted by backend and linked to this perp contract address. On-chain matching/settlement occurs when counterparties are available.",
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
      const symbol = typeof req.query.symbol === "string" ? req.query.symbol : undefined;
      const perpAddress = typeof req.query.perpAddress === "string" ? req.query.perpAddress : undefined;

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
        settlement.getTraderPositionSnapshots(trader),
        settlement.getMarkPrice(),
      ]);

      const intents = getOrderIntentsForTrader(trader).filter((intent) => {
        if (!symbol) return true;
        return intent.symbol === symbol.toUpperCase();
      });

      res.json({
        success: true,
        trader,
        symbol: symbol?.toUpperCase(),
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

  router.get("/params", async (_req, res) => {
  const { settlement, error } = getSettlementService();
  if (!settlement) {
    return res.status(503).json({ success: false, error });
  }

  try {
    const params = await settlement.getParams();
    res.json({ success: true, params });
  } catch (error) {
    console.error("Error fetching settlement params:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
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
  } catch (error) {
    console.error("Error updating settlement params:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
  });

  return router;
}
