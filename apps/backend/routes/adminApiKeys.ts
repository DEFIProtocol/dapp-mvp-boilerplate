import { Router, Request, Response } from "express";
import { Pool } from "pg";
import * as apiKeyHelpers from "../postgres/apiKeys";
import * as userHelpers from "../postgres/users";
import * as onboardingHelpers from "../postgres/onboarding";

const ADMIN_API_ACTION = process.env.ADMIN_API_ACTION || "ADMIN_API_KEY_MANAGEMENT";

export default function adminApiKeysRouter(pool: Pool) {
  const router = Router();

  const getParam = (value: string | string[] | undefined): string =>
    Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

  const validateWalletAddress = (value: unknown, res: Response): string | null => {
    const walletAddress = String(value || "").trim().toLowerCase();
    if (!userHelpers.isValidAddress(walletAddress)) {
      res.status(400).json({ success: false, error: "admin_wallet_address must be a valid wallet address" });
      return null;
    }
    return walletAddress;
  };

  const validateSignedAdminProof = (
    walletAddress: string,
    message: unknown,
    signature: unknown,
    res: Response
  ): boolean => {
    const msg = String(message || "").trim();
    const sig = String(signature || "").trim();
    if (!msg || !sig) {
      res.status(400).json({ success: false, error: "admin message and signature are required" });
      return false;
    }

    try {
      if (!onboardingHelpers.verifyWalletProof(walletAddress, msg, sig, ADMIN_API_ACTION)) {
        res.status(401).json({ success: false, error: "Admin signature verification failed" });
        return false;
      }
      return true;
    } catch (error: unknown) {
      const messageText = error instanceof Error ? error.message : String(error);
      res.status(401).json({ success: false, error: messageText });
      return false;
    }
  };

  const requireAdminAuth = async (req: Request, res: Response): Promise<boolean> => {
    const adminWallet = validateWalletAddress(
      req.body?.admin_wallet_address || req.query?.admin_wallet_address,
      res
    );
    if (!adminWallet) return false;

    const expectedAdmin = process.env.ADMIN_WALLET_ADDRESS?.trim().toLowerCase();
    if (!expectedAdmin) {
      res.status(500).json({ success: false, error: "ADMIN_WALLET_ADDRESS is not configured" });
      return false;
    }

    if (adminWallet !== expectedAdmin) {
      res.status(401).json({ success: false, error: "Admin wallet address does not match configured admin" });
      return false;
    }

    return validateSignedAdminProof(
      adminWallet,
      req.body?.message || req.headers["x-admin-message"],
      req.body?.signature || req.headers["x-admin-signature"],
      res
    );
  };

  // Get all API keys (with filters)
  router.get("/keys", async (req: Request, res: Response) => {
    try {
      if (!(await requireAdminAuth(req, res))) return;

      const tier = req.query?.tier ? String(req.query.tier) : undefined;
      const status = req.query?.status ? String(req.query.status) : undefined;

      let query = "SELECT * FROM api_keys WHERE 1=1";
      const params: any[] = [];

      if (tier) {
        params.push(tier);
        query += ` AND tier = $${params.length}`;
      }

      if (status) {
        params.push(status);
        query += ` AND status = $${params.length}`;
      }

      query += " ORDER BY created_at DESC";

      const result = await pool.query(query, params);
      const keys = result.rows.map(apiKeyHelpers.mapApiKeyRow).filter((row): row is apiKeyHelpers.ApiKeyRow => row !== null);

      res.json({
        success: true,
        keys: keys.map((key) => ({
          id: key.id,
          owner_name: key.owner_name,
          owner_email: key.owner_email,
          description: key.description,
          tier: key.tier,
          rate_limit_per_minute: key.rate_limit_per_minute,
          daily_spend_limit_usd: key.daily_spend_limit_usd,
          balance_usd: key.balance_usd,
          status: key.status,
          usage_count: key.usage_count,
          last_used_at: key.last_used_at,
          requester_wallet: key.requester_wallet,
          created_at: key.created_at,
          updated_at: key.updated_at,
        })),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  // Get pending Enterprise tier applications
  router.get("/pending-enterprise", async (req: Request, res: Response) => {
    try {
      if (!(await requireAdminAuth(req, res))) return;

      const result = await pool.query(
        `SELECT 
          k.*,
          u.kyc_status,
          u.kyc_verified_at,
          (SELECT SUM(amount_usdc) FROM api_key_deposits WHERE api_key_id = k.id AND verified = TRUE) as total_deposits
        FROM api_keys k
        LEFT JOIN users u ON k.requester_wallet = u.wallet_address
        WHERE k.tier = 'ENTERPRISE'
          AND k.status = 'ACTIVE'
        ORDER BY k.created_at DESC`
      );

      res.json({
        success: true,
        applications: result.rows.map((row) => ({
          ...apiKeyHelpers.mapApiKeyRow(row),
          kyc_status: row.kyc_status,
          kyc_verified_at: row.kyc_verified_at,
          total_deposits: parseFloat(row.total_deposits || "0"),
        })),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  // Get pending deposits for verification
  router.get("/deposits/pending", async (req: Request, res: Response) => {
    try {
      if (!(await requireAdminAuth(req, res))) return;

      const result = await pool.query(
        `SELECT 
          d.*,
          k.owner_name,
          k.tier,
          k.requester_wallet
        FROM api_key_deposits d
        JOIN api_keys k ON d.api_key_id = k.id
        WHERE d.verified = FALSE
        ORDER BY d.created_at DESC`
      );

      res.json({
        success: true,
        deposits: result.rows.map((row) => ({
          id: row.id,
          api_key_id: row.api_key_id,
          wallet_address: row.wallet_address,
          amount_usdc: parseFloat(row.amount_usdc),
          tx_hash: row.tx_hash,
          verified: row.verified,
          created_at: row.created_at,
          // Additional context
          owner_name: row.owner_name,
          tier: row.tier,
          requester_wallet: row.requester_wallet,
        })),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  // Verify a deposit
  router.post("/deposits/:id/verify", async (req: Request, res: Response) => {
    try {
      if (!(await requireAdminAuth(req, res))) return;

      const depositId = getParam(req.params.id);
      await apiKeyHelpers.verifyDeposit(pool, depositId);

      res.json({
        success: true,
        message: "Deposit verified and balance updated",
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  // Update API key (rate limits, status, etc.)
  router.patch("/keys/:id", async (req: Request, res: Response) => {
    try {
      if (!(await requireAdminAuth(req, res))) return;

      const keyId = getParam(req.params.id);
      const updates: any = {};

      if (req.body?.rate_limit_per_minute !== undefined) {
        updates.rate_limit_per_minute = parseInt(req.body.rate_limit_per_minute);
      }

      if (req.body?.status) {
        updates.status = String(req.body.status).toUpperCase();
        if (!["ACTIVE", "REVOKED", "DISABLED"].includes(updates.status)) {
          return res.status(400).json({ success: false, error: "Invalid status" });
        }
      }

      if (req.body?.description) {
        updates.description = String(req.body.description);
      }

      const updated = await apiKeyHelpers.updateApiKey(pool, keyId, updates);

      if (!updated) {
        return res.status(404).json({ success: false, error: "API key not found" });
      }

      res.json({
        success: true,
        message: "API key updated",
        key: {
          id: updated.id,
          tier: updated.tier,
          rate_limit_per_minute: updated.rate_limit_per_minute,
          status: updated.status,
          updated_at: updated.updated_at,
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  // Revoke API key
  router.post("/keys/:id/revoke", async (req: Request, res: Response) => {
    try {
      if (!(await requireAdminAuth(req, res))) return;

      const keyId = getParam(req.params.id);
      const updated = await apiKeyHelpers.updateApiKey(pool, keyId, { status: "REVOKED" });

      if (!updated) {
        return res.status(404).json({ success: false, error: "API key not found" });
      }

      res.json({
        success: true,
        message: "API key revoked",
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  // Get system analytics
  router.get("/analytics", async (req: Request, res: Response) => {
    try {
      if (!(await requireAdminAuth(req, res))) return;

      // Get key counts by tier
      const tierStats = await pool.query(
        `SELECT tier, COUNT(*) as count, SUM(usage_count) as total_requests
        FROM api_keys
        WHERE status = 'ACTIVE'
        GROUP BY tier`
      );

      // Get total usage in last 30 days
      const usageStats = await pool.query(
        `SELECT 
          COUNT(*) as total_requests,
          SUM(cost_usd) as total_revenue,
          AVG(response_time_ms) as avg_response_time
        FROM api_key_usage_log
        WHERE created_at >= NOW() - INTERVAL '30 days'`
      );

      // Get top keys by usage
      const topKeys = await pool.query(
        `SELECT 
          k.id,
          k.owner_name,
          k.tier,
          COUNT(l.id) as request_count,
          SUM(l.cost_usd) as revenue
        FROM api_keys k
        LEFT JOIN api_key_usage_log l ON k.id = l.api_key_id
        WHERE l.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY k.id, k.owner_name, k.tier
        ORDER BY request_count DESC
        LIMIT 10`
      );

      res.json({
        success: true,
        analytics: {
          tier_stats: tierStats.rows,
          usage_stats: usageStats.rows[0],
          top_keys: topKeys.rows,
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  return router;
}
