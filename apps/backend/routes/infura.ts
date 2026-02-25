import { Router } from "express";
import { Pool } from "pg";
import { getHoldings } from "../infura";

export default (pool: Pool) => {
  const router = Router();

  router.get("/holdings", async (req, res) => {
    try {
      const data = await getHoldings(pool, req.query);
      res.json(data);
    } catch (err: any) {
      console.error("Infura error:", err.message);
      res.status(500).json({ error: err.message || "Failed to fetch holdings" });
    }
  });

  return router;
};