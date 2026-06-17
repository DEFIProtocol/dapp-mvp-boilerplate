import { Router, Request, Response } from "express";
import { Pool } from "pg";
import * as apiKeyHelpers from "../postgres/apiKeys";
import * as userHelpers from "../postgres/users";
import * as onboardingHelpers from "../postgres/onboarding";

const ADMIN_API_ACTION = process.env.ADMIN_API_ACTION || "ADMIN_API_KEY_MANAGEMENT";

function getParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function getRequestValue(req: Request, key: string): string {
  const bodyValue = (req.body || {})[key];
  if (typeof bodyValue === "string") return bodyValue.trim();

  const headerValue = String(req.headers[`x-${key}`] || "").trim();
  if (headerValue) return headerValue;

  const queryValue = req.query?.[key];
  if (typeof queryValue === "string") return queryValue.trim();
  if (Array.isArray(queryValue) && queryValue[0]) return String(queryValue[0]).trim();

  return "";
}

function validateWalletAddress(value: unknown, res: Response): string | null {
  const walletAddress = String(value || "").trim().toLowerCase();
  if (!userHelpers.isValidAddress(walletAddress)) {
    res.status(400).json({ success: false, error: "admin_wallet_address must be a valid wallet address" });
    return null;
  }
  return walletAddress;
}

function validateSignedAdminProof(
  walletAddress: string,
  message: unknown,
  signature: unknown,
  res: Response
): boolean {
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
}

async function requireAdminAuth(req: Request, res: Response): Promise<boolean> {
  const adminWallet = validateWalletAddress(getRequestValue(req, "admin-wallet-address") || req.body?.admin_wallet_address, res);
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

  return validateSignedAdminProof(adminWallet, req.body?.message || req.headers["x-admin-message"], req.body?.signature || req.headers["x-admin-signature"], res);
}

export default function apiKeysRouter(pool: Pool) {
  const router = Router();

  router.post("/", async (req: Request, res: Response) => {
    try {
      if (!(await requireAdminAuth(req, res))) return;

      const ownerName = String(req.body?.owner_name || req.body?.ownerName || "").trim() || null;
      const ownerEmail = String(req.body?.owner_email || req.body?.ownerEmail || "").trim() || null;
      const description = String(req.body?.description || "").trim() || null;
      const allowedEndpoints = Array.isArray(req.body?.allowed_endpoints)
        ? req.body?.allowed_endpoints.map(String)
        : [];
      const rateLimitPerMinute = Number(req.body?.rate_limit_per_minute || req.body?.rateLimitPerMinute || 120);

      const created = await apiKeyHelpers.createApiKey(
        pool,
        ownerName,
        ownerEmail,
        description,
        allowedEndpoints,
        Number.isNaN(rateLimitPerMinute) ? 120 : rateLimitPerMinute
      );
      res.status(201).json({
        success: true,
        data: {
          id: created.apiKey.id,
          owner_name: created.apiKey.owner_name,
          owner_email: created.apiKey.owner_email,
          description: created.apiKey.description,
          allowed_endpoints: created.apiKey.allowed_endpoints,
          rate_limit_per_minute: created.apiKey.rate_limit_per_minute,
          status: created.apiKey.status,
          created_at: created.apiKey.created_at,
          updated_at: created.apiKey.updated_at,
          raw_api_key: created.rawApiKey,
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  router.get("/", async (req: Request, res: Response) => {
    try {
      if (!(await requireAdminAuth(req, res))) return;
      const keys = await apiKeyHelpers.getApiKeys(pool);
      res.json({ success: true, data: keys.map((key) => ({
        id: key.id,
        owner_name: key.owner_name,
        owner_email: key.owner_email,
        description: key.description,
        allowed_endpoints: key.allowed_endpoints,
        rate_limit_per_minute: key.rate_limit_per_minute,
        status: key.status,
        created_at: key.created_at,
        updated_at: key.updated_at,
        last_used_at: key.last_used_at,
        usage_count: key.usage_count,
      })) });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  router.get("/:id", async (req: Request, res: Response) => {
    try {
      if (!(await requireAdminAuth(req, res))) return;
      const apiKey = await apiKeyHelpers.getApiKeyById(pool, getParam(req.params.id));
      if (!apiKey) {
        return res.status(404).json({ success: false, error: "API key not found" });
      }
      res.json({ success: true, data: {
        id: apiKey.id,
        owner_name: apiKey.owner_name,
        owner_email: apiKey.owner_email,
        description: apiKey.description,
        allowed_endpoints: apiKey.allowed_endpoints,
        rate_limit_per_minute: apiKey.rate_limit_per_minute,
        status: apiKey.status,
        created_at: apiKey.created_at,
        updated_at: apiKey.updated_at,
        last_used_at: apiKey.last_used_at,
        usage_count: apiKey.usage_count,
      }});
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  router.patch("/:id", async (req: Request, res: Response) => {
    try {
      if (!(await requireAdminAuth(req, res))) return;
      const id = getParam(req.params.id);
      const status = req.body?.status ? String(req.body.status).trim() : undefined;
      const description = req.body?.description ? String(req.body.description).trim() : undefined;
      const allowedEndpoints = Array.isArray(req.body?.allowed_endpoints)
        ? req.body?.allowed_endpoints.map(String)
        : undefined;
      const rateLimitPerMinute = typeof req.body?.rate_limit_per_minute === "number"
        ? req.body.rate_limit_per_minute
        : typeof req.body?.rateLimitPerMinute === "number"
          ? req.body.rateLimitPerMinute
          : undefined;

      if (status && !["ACTIVE", "REVOKED", "DISABLED"].includes(status.toUpperCase())) {
        return res.status(400).json({ success: false, error: "Invalid status value" });
      }

      const updated = await apiKeyHelpers.updateApiKey(pool, id, {
        status: status?.toUpperCase() as any,
        description,
        allowed_endpoints: allowedEndpoints,
        rate_limit_per_minute: rateLimitPerMinute,
      });

      if (!updated) {
        return res.status(404).json({ success: false, error: "API key not found" });
      }

      res.json({ success: true, data: {
        id: updated.id,
        owner_name: updated.owner_name,
        owner_email: updated.owner_email,
        description: updated.description,
        allowed_endpoints: updated.allowed_endpoints,
        rate_limit_per_minute: updated.rate_limit_per_minute,
        status: updated.status,
        created_at: updated.created_at,
        updated_at: updated.updated_at,
        last_used_at: updated.last_used_at,
        usage_count: updated.usage_count,
      }});
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ success: false, error: message });
    }
  });

  return router;
}
