// backend/routes/perpsTokens.ts
import { Router } from "express";
import { Pool } from "pg";
import * as perpsHelpers from "../postgres/perps";

export default function perpsTokensRouter(pool: Pool) {
  const router = Router();

  // GET all perps tokens
  router.get("/db", async (req, res) => {
    try {
      const onlyActive = req.query.active === 'true';
      const tokens = await perpsHelpers.getAllPerpsTokens(pool, { onlyActive });
      res.json({
        source: 'database',
        data: tokens,
        count: tokens.length
      });
    } catch (error) {
      console.error('Error fetching perps tokens:', error);
      res.status(500).json({ 
        error: "Failed to fetch perps tokens",
        data: [] 
      });
    }
  });

  // GET perps token by symbol
  router.get("/db/:symbol", async (req, res) => {
    try {
      const token = await perpsHelpers.getPerpsTokenBySymbol(pool, req.params.symbol);
      if (!token) {
        return res.status(404).json({ error: "Perps token not found" });
      }
      res.json(token);
    } catch (error) {
      console.error('Error fetching perps token:', error);
      res.status(500).json({ error: "Failed to fetch perps token" });
    }
  });

  // POST create new perps token
  router.post("/db", async (req, res) => {
    try {
      const token = await perpsHelpers.createPerpsToken(pool, req.body);
      res.status(201).json(token);
    } catch (error: any) {
      if (error.message === 'Perps token with this symbol already exists') {
        return res.status(409).json({ error: error.message });
      }
      console.error('Error creating perps token:', error);
      res.status(500).json({ error: "Failed to create perps token" });
    }
  });

  // PUT update perps token
  router.put("/db/:symbol", async (req, res) => {
    try {
      const token = await perpsHelpers.updatePerpsToken(pool, req.params.symbol, req.body);
      if (!token) {
        return res.status(404).json({ error: "Perps token not found" });
      }
      res.json(token);
    } catch (error) {
      console.error('Error updating perps token:', error);
      res.status(500).json({ error: "Failed to update perps token" });
    }
  });

  // PATCH toggle active status
  router.patch("/db/:symbol/toggle", async (req, res) => {
    try {
      const { isActive } = req.body;
      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ error: "isActive boolean required" });
      }
      const token = await perpsHelpers.togglePerpsTokenActive(pool, req.params.symbol, isActive);
      if (!token) {
        return res.status(404).json({ error: "Perps token not found" });
      }
      res.json(token);
    } catch (error) {
      console.error('Error toggling perps token:', error);
      res.status(500).json({ error: "Failed to toggle perps token" });
    }
  });

  // DELETE perps token
  router.delete("/db/:symbol", async (req, res) => {
    try {
      const token = await perpsHelpers.deletePerpsToken(pool, req.params.symbol);
      if (!token) {
        return res.status(404).json({ error: "Perps token not found" });
      }
      res.json({ message: "Perps token deleted", deleted: token });
    } catch (error) {
      console.error('Error deleting perps token:', error);
      res.status(500).json({ error: "Failed to delete perps token" });
    }
  });

  return router;
}