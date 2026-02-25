import { Router, Request, Response } from "express";
import { Pool } from "pg";
import * as tokenHelpers from "../postgres/tokens";


export default function tokensRouter(pool: Pool) {
  const router = Router();

  // GET all tokens from DB (enriched)
  router.get("/db", async (_req: Request, res: Response) => {
    try {
      const result = await pool.query("SELECT * FROM tokens ORDER BY symbol");
      const tokens = result.rows;
      const addressMap = await tokenHelpers.getTokenAddressesMap(pool);
      const enrichedTokens = tokens.map(token => {
        const addresses = tokenHelpers.getTokenAddressesForTokenSync(addressMap, token.id, token.symbol);
        return { ...token, addresses };
      });
      res.json(enrichedTokens);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tokens from database" });
    }
  });

  // GET token by symbol (enriched)
  router.get("/db/:symbol", async (req: Request, res: Response) => {
    try {
      const { symbol } = req.params;
      const token = await tokenHelpers.getTokenBySymbol(pool, symbol);
      if (!token) {
        return res.status(404).json({ error: "Token not found" });
      }
      const addressMap = await tokenHelpers.getTokenAddressesMap(pool);
      const addresses = tokenHelpers.getTokenAddressesForTokenSync(addressMap, token.id, token.symbol);
      res.json({ ...token, addresses });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch token from database" });
    }
  });

  // GET all tokens from JSON
  router.get("/json", async (_req: Request, res: Response) => {
    try {
      const tokens = await tokenHelpers.getJsonTokens(pool);
      res.json(tokens);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tokens from JSON file" });
    }
  });

  // GET token by symbol from JSON
  router.get("/json/:symbol", async (req: Request, res: Response) => {
    try {
      const { symbol } = req.params;
      const tokens = await tokenHelpers.getJsonTokens(pool);
      const token = tokens.find(t => t.symbol.toLowerCase() === symbol.toLowerCase());
      if (!token) {
        return res.status(404).json({ error: "Token not found in JSON" });
      }
      res.json(token);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch token from JSON file" });
    }
  });

  // POST create new token (use helper)
  router.post("/db", async (req: Request, res: Response) => {
    try {
      const result = await tokenHelpers.createToken(pool, req.body);
      res.status(201).json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to create token" });
    }
  });

  // PUT update token (use helper)
  router.put("/db/:symbol", async (req: Request, res: Response) => {
    try {
      const result = await tokenHelpers.updateToken(pool, req.params.symbol, req.body);
      if (!result) {
        return res.status(404).json({ error: "Token not found" });
      }
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to update token" });
    }
  });

  // DELETE token (use helper)
  router.delete("/db/:symbol", async (req: Request, res: Response) => {
    try {
      const result = await tokenHelpers.deleteToken(pool, req.params.symbol);
      if (!result) {
        return res.status(404).json({ error: "Token not found" });
      }
      res.json({ message: "Token deleted", deleted: result });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete token" });
    }
  });

  return router;
}
