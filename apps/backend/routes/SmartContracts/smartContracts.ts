import express from "express";
import { Pool } from "pg";
import perpsPaperTradingRouter from "./perpsPaperTrading";
import optionsPaperTradingRouter from "./optionsPaperTrading";
import faucetRouter from "./faucetRoutes";

export default function smartContractsRouter(pool: Pool) {
  const router = express.Router();

  // Clear separation: dedicated route namespaces.
  router.use("/perps", perpsPaperTradingRouter(pool));
  router.use("/options", optionsPaperTradingRouter());
  router.use("/faucet", faucetRouter(pool));

  // Backward-compatible aliases for existing callers.
  router.use("/", perpsPaperTradingRouter(pool));

  return router;
}
