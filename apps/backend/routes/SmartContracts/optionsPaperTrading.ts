import express from "express";
import { isAddress } from "ethers";
import { ensurePaperTradingChain, parseNumeric } from "./paperTradingGuards";

type OrderSide = "LONG" | "SHORT";
type OptionType = "CALL" | "PUT";

type OptionOrderIntent = {
  id: string;
  createdAt: string;
  trader: string;
  seriesId: string;
  optionType: OptionType;
  side: OrderSide;
  size: number;
  premiumLimitUsd?: number;
  status: "queued";
};

const optionOrderIntentStore = new Map<string, OptionOrderIntent[]>();

function getOptionOrderIntentsForTrader(trader: string): OptionOrderIntent[] {
  return optionOrderIntentStore.get(trader.toLowerCase()) ?? [];
}

function pushOptionOrderIntent(intent: OptionOrderIntent) {
  const key = intent.trader.toLowerCase();
  const existing = optionOrderIntentStore.get(key) ?? [];
  existing.unshift(intent);
  optionOrderIntentStore.set(key, existing.slice(0, 50));
}

export default function optionsPaperTradingRouter() {
  const router = express.Router();

  router.post("/orders", async (req, res) => {
    try {
      const { chainId, trader, seriesId, optionType, side, size, premiumLimitUsd } = req.body ?? {};

      const chainGuard = ensurePaperTradingChain(chainId);
      if (!chainGuard.ok) {
        return res.status(400).json({ success: false, error: chainGuard.message });
      }

      if (typeof trader !== "string" || !isAddress(trader)) {
        return res.status(400).json({ success: false, error: "trader must be a valid EVM address" });
      }

      if (typeof seriesId !== "string" || seriesId.trim().length === 0) {
        return res.status(400).json({ success: false, error: "seriesId is required" });
      }

      if (optionType !== "CALL" && optionType !== "PUT") {
        return res.status(400).json({ success: false, error: "optionType must be CALL or PUT" });
      }

      if (side !== "LONG" && side !== "SHORT") {
        return res.status(400).json({ success: false, error: "side must be LONG or SHORT" });
      }

      const sizeValue = parseNumeric(size);
      if (sizeValue === null || sizeValue <= 0) {
        return res.status(400).json({ success: false, error: "size must be a positive number" });
      }

      const premiumLimitValue = premiumLimitUsd === undefined ? undefined : parseNumeric(premiumLimitUsd);
      if (premiumLimitUsd !== undefined && (premiumLimitValue === null || premiumLimitValue <= 0)) {
        return res.status(400).json({ success: false, error: "premiumLimitUsd must be a positive number when provided" });
      }

      const intent: OptionOrderIntent = {
        id: `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
        createdAt: new Date().toISOString(),
        trader,
        seriesId,
        optionType,
        side,
        size: sizeValue,
        premiumLimitUsd: premiumLimitValue === null ? undefined : premiumLimitValue,
        status: "queued",
      };

      pushOptionOrderIntent(intent);

      res.json({
        success: true,
        order: intent,
        onChain: {
          engineExecution: "queued-for-options-engine",
          note: "Option order intent accepted for Base Sepolia paper trading. Wire options engine execution after deployment addresses are configured.",
        },
      });
    } catch (routeError) {
      console.error("Error creating option order intent:", routeError);
      res.status(500).json({
        success: false,
        error: routeError instanceof Error ? routeError.message : "Unknown error",
      });
    }
  });

  router.get("/orders/:trader", async (req, res) => {
    try {
      const { trader } = req.params;
      const chainId = req.query.chainId;

      const chainGuard = ensurePaperTradingChain(chainId);
      if (!chainGuard.ok) {
        return res.status(400).json({ success: false, error: chainGuard.message });
      }

      if (!isAddress(trader)) {
        return res.status(400).json({ success: false, error: "trader must be a valid EVM address" });
      }

      res.json({
        success: true,
        trader,
        pendingOrders: getOptionOrderIntentsForTrader(trader),
      });
    } catch (routeError) {
      console.error("Error fetching option order intents:", routeError);
      res.status(500).json({
        success: false,
        error: routeError instanceof Error ? routeError.message : "Unknown error",
      });
    }
  });

  return router;
}
