import { Router } from "express";
import { Pool } from "pg";
import * as tokenHelpers from "../postgres/tokens";

export default function tokensRouter(pool: Pool) {
  const router = Router();

  // GET all tokens from DB
  router.get("/db", async (_req, res) => {
    try {
      const tokens = await tokenHelpers.getAllTokens(pool);
      res.json({
        source: 'database',
        data: tokens,
        count: tokens.length
      });
    } catch (error) {
      console.error('Error fetching tokens:', error);
      res.status(500).json({ 
        error: "Failed to fetch tokens",
        source: 'database',
        data: [] 
      });
    }
  });

  // GET token by symbol
  router.get("/db/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      const token = await tokenHelpers.getTokenBySymbol(pool, symbol);
      
      if (!token) {
        return res.status(404).json({ error: "Token not found" });
      }
      
      const addresses = await tokenHelpers.getTokenAddressesForToken(pool, { 
        tokenId: token.id, 
        symbol: token.symbol 
      });
      
      res.json({
        source: 'database',
        data: { ...token, addresses }
      });
    } catch (error) {
      console.error('Error fetching token:', error);
      res.status(500).json({ error: "Failed to fetch token" });
    }
  });

  // POST create new token
  router.post("/db", async (req, res) => {
    try {
      const token = await tokenHelpers.createToken(pool, req.body);
      res.status(201).json(token);
    } catch (error: any) {
      if (error.message === 'Token with this symbol already exists') {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to create token" });
    }
  });

  // PUT update token
  router.put("/db/:symbol", async (req, res) => {
    try {
      const token = await tokenHelpers.updateToken(pool, req.params.symbol, req.body);
      if (!token) {
        return res.status(404).json({ error: "Token not found" });
      }
      res.json(token);
    } catch (error) {
      res.status(500).json({ error: "Failed to update token" });
    }
  });

  // DELETE token
  router.delete("/db/:symbol", async (req, res) => {
    try {
      const token = await tokenHelpers.deleteToken(pool, req.params.symbol);
      if (!token) {
        return res.status(404).json({ error: "Token not found" });
      }
      res.json({ message: "Token deleted", deleted: token });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete token" });
    }
  });

  // Token Address endpoints
  router.get("/db/:symbol/addresses", async (req, res) => {
    try {
      const { symbol } = req.params;
      const token = await tokenHelpers.getTokenBySymbol(pool, symbol);
      if (!token) {
        return res.status(404).json({ error: "Token not found" });
      }
      const addresses = await tokenHelpers.getTokenAddressesForToken(pool, { 
        tokenId: token.id, 
        symbol: token.symbol 
      });
      res.json(addresses);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch token addresses" });
    }
  });

  router.post("/db/:symbol/addresses", async (req, res) => {
    try {
      const { symbol } = req.params;
      const { chain, address } = req.body;
      
      if (!chain || !address) {
        return res.status(400).json({ error: 'Chain and address are required' });
      }
      
      const result = await tokenHelpers.createTokenAddress(pool, symbol, chain, address);
      res.status(201).json(result);
    } catch (error: any) {
      if (error.message === 'Token not found') {
        return res.status(404).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to create token address" });
    }
  });

  router.put("/db/:symbol/addresses/:chain", async (req, res) => {
    try {
      const { symbol, chain } = req.params;
      const { address } = req.body;
      
      if (!address) {
        return res.status(400).json({ error: 'Address is required' });
      }
      
      const result = await tokenHelpers.updateTokenAddress(pool, symbol, chain, address);
      if (!result) {
        return res.status(404).json({ error: "Token address not found" });
      }
      res.json(result);
    } catch (error: any) {
      if (error.message === 'Token not found') {
        return res.status(404).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to update token address" });
    }
  });

  router.delete("/db/:symbol/addresses/:chain", async (req, res) => {
    try {
      const { symbol, chain } = req.params;
      const result = await tokenHelpers.deleteTokenAddress(pool, symbol, chain);
      if (!result) {
        return res.status(404).json({ error: "Token address not found" });
      }
      res.json({ message: "Token address deleted", deleted: result });
    } catch (error: any) {
      if (error.message === 'Token not found') {
        return res.status(404).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to delete token address" });
    }
  });

  // JSON endpoints
  router.get("/json", async (_req, res) => {
    try {
      const tokens = await tokenHelpers.getJsonTokens(pool);
      res.json(tokens);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tokens from JSON" });
    }
  });

  router.get("/json/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      const tokens = await tokenHelpers.getJsonTokens(pool);
      const token = tokens.find((t: any) => t.symbol.toLowerCase() === symbol.toLowerCase());
      if (!token) {
        return res.status(404).json({ error: "Token not found in JSON" });
      }
      res.json(token);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch token from JSON" });
    }
  });

  // Manual sync endpoint
  router.post("/sync-to-json", async (_req, res) => {
    try {
      const tokens = await tokenHelpers.generateAndWriteJsonFile(pool);
      res.json({ 
        success: true, 
        message: "JSON file updated successfully",
        count: tokens.length 
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: "Failed to sync to JSON file" 
      });
    }
  });

  return router;
}