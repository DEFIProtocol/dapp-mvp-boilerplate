import { Router, Request, Response } from "express";
import { Pool } from "pg";
import * as apiKeyHelpers from "../postgres/apiKeys";
import * as userHelpers from "../postgres/users";
import * as onboardingHelpers from "../postgres/onboarding";

export default function developerApiKeysRouter(pool: Pool) {
  const router = Router();

  const getParam = (value: string | string[] | undefined): string =>
    Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

  const validateWalletAddress = (value: unknown, res: Response): string | null => {
    const walletAddress = String(value || "").trim().toLowerCase();
    if (!userHelpers.isValidAddress(walletAddress)) {
      res.status(400).json({ success: false, error: "wallet_address must be a valid address" });
      return null;
    }
    return walletAddress;
  };

  const validateSignedWalletProof = (
    walletAddress: string,
    message: unknown,
    signature: unknown,
    expectedAction: string,
    res: Response
  ): boolean => {
    const msg = String(message || "").trim();
    const sig = String(signature || "").trim();
    if (!msg || !sig) {
      res.status(400).json({ success: false, error: "message and signature are required" });
      return false;
    }

    try {
      if (!onboardingHelpers.verifyWalletProof(walletAddress, msg, sig, expectedAction)) {
        res.status(401).json({ success: false, error: "signature verification failed" });
        return false;
      }
      return true;
    } catch (error: unknown) {
      const messageText = error instanceof Error ? error.message : String(error);
      res.status(401).json({ success: false, error: messageText });
      return false;
    }
  };

  // Get available tiers
  router.get("/tiers", async (req: Request, res: Response) => {
    try {
      res.json({
        success: true,
        tiers: [
          {
            id: "SANDBOX",
            name: "Sandbox",
            description: "Testnet / Mock data only",
            rate_limit: 60,
            daily_spend_limit: null,
            cost: "FREE",
            requires_kyc: false,
            requires_deposit: false,
            features: ["Testnet access", "Mock data", "60 req/min"],
          },
          {
            id: "PRODUCTION_LITE",
            name: "Production Lite",
            description: "Mainnet live data with daily limits",
            rate_limit: 120,
            daily_spend_limit: 10.00,
            cost: "$25 minimum deposit",
            requires_kyc: false,
            requires_deposit: true,
            min_deposit: 25.00,
            features: ["Mainnet access", "120 req/min", "$10/day spend cap"],
          },
          {
            id: "ENTERPRISE",
            name: "Enterprise",
            description: "Unlimited Mainnet + Webhooks",
            rate_limit: 1000,
            daily_spend_limit: null,
            cost: "$100 minimum deposit + KYC",
            requires_kyc: true,
            requires_deposit: true,
            min_deposit: 100.00,
            features: ["Unlimited Mainnet", "1000+ req/min", "Webhooks", "Custom endpoints"],
          },
        ],
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  // Request new API key (any tier)
  router.post("/request", async (req: Request, res: Response) => {
    try {
      const walletAddress = validateWalletAddress(req.body?.wallet_address, res);
      if (!walletAddress) return;

      if (!validateSignedWalletProof(
        walletAddress,
        req.body?.message,
        req.body?.signature,
        "API_KEY_REQUEST",
        res
      )) {
        return;
      }

      const tier = String(req.body?.tier || "SANDBOX").toUpperCase();
      const projectName = String(req.body?.project_name || "").trim();
      const description = String(req.body?.description || "").trim();
      const email = String(req.body?.email || "").trim() || null;

      // Validate tier
      if (!["SANDBOX", "PRODUCTION_LITE", "ENTERPRISE"].includes(tier)) {
        return res.status(400).json({ success: false, error: "Invalid tier" });
      }

      // Check if user exists
      let user = await userHelpers.getUserByWallet(pool, walletAddress);
      if (!user) {
        user = await userHelpers.createUser(pool, { wallet_address: walletAddress });
      }

      // For ENTERPRISE tier, check KYC status
      if (tier === "ENTERPRISE") {
        if (user?.kyc_status !== "KYC_VERIFIED") {
          return res.status(403).json({
            success: false,
            error: "Enterprise tier requires KYC verification",
            kyc_status: user?.kyc_status,
          });
        }
      }

      // Create the API key
      const created = await apiKeyHelpers.createTieredApiKey(
        pool,
        tier,
        projectName || null,
        email,
        description || null,
        walletAddress
      );

      // For SANDBOX and PRODUCTION_LITE, auto-approve
      // For ENTERPRISE, it goes to admin review (status stays ACTIVE but admin can review)
      
      res.status(201).json({
        success: true,
        message: tier === "ENTERPRISE" 
          ? "Enterprise key created. Pending admin review for custom rate limits."
          : "API key created successfully",
        data: {
          id: created.apiKey.id,
          tier: created.apiKey.tier,
          rate_limit_per_minute: created.apiKey.rate_limit_per_minute,
          daily_spend_limit_usd: created.apiKey.daily_spend_limit_usd,
          balance_usd: created.apiKey.balance_usd,
          status: created.apiKey.status,
          created_at: created.apiKey.created_at,
          // Only show raw key once on creation
          raw_api_key: created.rawApiKey,
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  // Get my API keys
  router.get("/my-keys", async (req: Request, res: Response) => {
    try {
      const walletAddress = validateWalletAddress(req.query?.wallet_address, res);
      if (!walletAddress) return;

      if (!validateSignedWalletProof(
        walletAddress,
        req.headers["x-message"],
        req.headers["x-signature"],
        "GET_MY_KEYS",
        res
      )) {
        return;
      }

      const keys = await apiKeyHelpers.getApiKeysByWallet(pool, walletAddress);

      res.json({
        success: true,
        keys: keys.map((key) => ({
          id: key.id,
          owner_name: key.owner_name,
          description: key.description,
          tier: key.tier,
          rate_limit_per_minute: key.rate_limit_per_minute,
          daily_spend_limit_usd: key.daily_spend_limit_usd,
          balance_usd: key.balance_usd,
          status: key.status,
          usage_count: key.usage_count,
          last_used_at: key.last_used_at,
          created_at: key.created_at,
          // Never return the raw key or hash
        })),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  // Submit deposit for verification
  router.post("/deposits/submit", async (req: Request, res: Response) => {
    try {
      const walletAddress = validateWalletAddress(req.body?.wallet_address, res);
      if (!walletAddress) return;

      if (!validateSignedWalletProof(
        walletAddress,
        req.body?.message,
        req.body?.signature,
        "SUBMIT_DEPOSIT",
        res
      )) {
        return;
      }

      const apiKeyId = String(req.body?.api_key_id || "").trim();
      const txHash = String(req.body?.tx_hash || "").trim();
      const amountUsdc = parseFloat(req.body?.amount_usdc || "0");

      if (!apiKeyId || !txHash || amountUsdc <= 0) {
        return res.status(400).json({
          success: false,
          error: "api_key_id, tx_hash, and amount_usdc are required",
        });
      }

      // Verify the key belongs to this wallet
      const apiKey = await apiKeyHelpers.getApiKeyById(pool, apiKeyId);
      if (!apiKey || apiKey.requester_wallet?.toLowerCase() !== walletAddress) {
        return res.status(403).json({ success: false, error: "API key not found or unauthorized" });
      }

      // Add deposit (pending verification)
      await apiKeyHelpers.addDeposit(pool, apiKeyId, walletAddress, amountUsdc, txHash);

      res.json({
        success: true,
        message: "Deposit submitted for verification. This usually takes 1-2 minutes.",
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("duplicate key")) {
        return res.status(400).json({ success: false, error: "This transaction has already been submitted" });
      }
      res.status(500).json({ success: false, error: message });
    }
  });

  // Get balance for a key
  router.get("/balance/:keyId", async (req: Request, res: Response) => {
    try {
      const walletAddress = validateWalletAddress(req.query?.wallet_address, res);
      if (!walletAddress) return;

      if (!validateSignedWalletProof(
        walletAddress,
        req.headers["x-message"],
        req.headers["x-signature"],
        "GET_BALANCE",
        res
      )) {
        return;
      }

      const keyId = getParam(req.params.keyId);
      const apiKey = await apiKeyHelpers.getApiKeyById(pool, keyId);

      if (!apiKey || apiKey.requester_wallet?.toLowerCase() !== walletAddress) {
        return res.status(403).json({ success: false, error: "API key not found or unauthorized" });
      }

      res.json({
        success: true,
        balance: {
          balance_usd: apiKey.balance_usd || 0,
          daily_spend_limit_usd: apiKey.daily_spend_limit_usd,
          tier: apiKey.tier,
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  // Get usage stats for a key
  router.get("/usage/:keyId", async (req: Request, res: Response) => {
    try {
      const walletAddress = validateWalletAddress(req.query?.wallet_address, res);
      if (!walletAddress) return;

      if (!validateSignedWalletProof(
        walletAddress,
        req.headers["x-message"],
        req.headers["x-signature"],
        "GET_USAGE",
        res
      )) {
        return;
      }

      const keyId = getParam(req.params.keyId);
      const apiKey = await apiKeyHelpers.getApiKeyById(pool, keyId);

      if (!apiKey || apiKey.requester_wallet?.toLowerCase() !== walletAddress) {
        return res.status(403).json({ success: false, error: "API key not found or unauthorized" });
      }

      // Get usage logs for the last 30 days
      const usageLogs = await pool.query(
        `SELECT 
          DATE(created_at) as date,
          COUNT(*) as request_count,
          SUM(cost_usd) as total_cost,
          AVG(response_time_ms) as avg_response_time
        FROM api_key_usage_log
        WHERE api_key_id = $1
          AND created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(created_at)
        ORDER BY date DESC`,
        [keyId]
      );

      res.json({
        success: true,
        usage: {
          total_requests: apiKey.usage_count || 0,
          last_used_at: apiKey.last_used_at,
          daily_stats: usageLogs.rows,
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  // Delete API key (user-initiated hard delete)
  router.delete("/:keyId", async (req: Request, res: Response) => {
    try {
      const walletAddress = validateWalletAddress(req.body?.wallet_address, res);
      if (!walletAddress) return;

      if (!validateSignedWalletProof(
        walletAddress,
        req.body?.message,
        req.body?.signature,
        "DELETE_API_KEY",
        res
      )) {
        return;
      }

      const keyId = getParam(req.params.keyId);
      const apiKey = await apiKeyHelpers.getApiKeyById(pool, keyId);

      if (!apiKey) {
        return res.status(404).json({ success: false, error: "API key not found" });
      }

      if (apiKey.requester_wallet?.toLowerCase() !== walletAddress) {
        return res.status(403).json({ success: false, error: "Unauthorized to delete this API key" });
      }

      // Hard delete: Remove the API key completely from the database
      await pool.query(
        `DELETE FROM api_keys WHERE id = $1`,
        [keyId]
      );

      res.json({
        success: true,
        message: "API key has been deleted successfully",
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  // Revoke API key (admin-initiated soft delete for audit trail)
  router.patch("/:keyId/revoke", async (req: Request, res: Response) => {
    try {
      const walletAddress = validateWalletAddress(req.body?.wallet_address, res);
      if (!walletAddress) return;

      if (!validateSignedWalletProof(
        walletAddress,
        req.body?.message,
        req.body?.signature,
        "REVOKE_API_KEY",
        res
      )) {
        return;
      }

      const keyId = getParam(req.params.keyId);
      const apiKey = await apiKeyHelpers.getApiKeyById(pool, keyId);

      if (!apiKey) {
        return res.status(404).json({ success: false, error: "API key not found" });
      }

      // Check if user is admin (you can add admin check here later)
      // For now, only allow the owner to revoke
      if (apiKey.requester_wallet?.toLowerCase() !== walletAddress) {
        return res.status(403).json({ success: false, error: "Unauthorized to revoke this API key" });
      }

      // Soft delete: Mark as REVOKED for audit trail
      await pool.query(
        `UPDATE api_keys 
         SET status = 'REVOKED', 
             updated_at = NOW() 
         WHERE id = $1`,
        [keyId]
      );

      res.json({
        success: true,
        message: "API key has been revoked successfully",
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  return router;
}
