import { NextFunction, Request, Response } from "express";
import { Pool } from "pg";
import * as apiKeyHelpers from "../postgres/apiKeys";
import { redis } from "../redis";

interface AuthenticatedRequest extends Request {
  apiKey?: apiKeyHelpers.ApiKeyRow;
}

const DEFAULT_API_RATE_LIMIT_PER_MINUTE = Number(process.env.DEVELOPER_API_RATE_LIMIT_PER_MINUTE || 120);
const RATE_LIMIT_WINDOW_SECONDS = Number(process.env.DEVELOPER_API_RATE_LIMIT_WINDOW_SECONDS || 60);

const inMemoryRateLimits = new Map<string, { expiresAt: number; count: number }>();

async function trackApiKeyRateLimit(apiKeyId: string, limit: number) {
  const bucketId = `${apiKeyId}:${Math.floor(Date.now() / 1000 / RATE_LIMIT_WINDOW_SECONDS)}`;

  if (redis.isOpen) {
    try {
      const current = await redis.incr(bucketId);
      if (current === 1) {
        await redis.expire(bucketId, RATE_LIMIT_WINDOW_SECONDS);
      }
      return {
        allowed: current <= limit,
        remaining: Math.max(0, limit - current),
      };
    } catch (error) {
      console.warn("⚠️ Redis rate limiter failed, falling back to local memory", error);
    }
  }

  const now = Date.now();
  const existing = inMemoryRateLimits.get(bucketId);
  if (!existing || existing.expiresAt <= now) {
    inMemoryRateLimits.set(bucketId, {
      expiresAt: now + RATE_LIMIT_WINDOW_SECONDS * 1000,
      count: 1,
    });
    return { allowed: limit > 0, remaining: limit - 1 };
  }

  existing.count += 1;
  inMemoryRateLimits.set(bucketId, existing);
  return {
    allowed: existing.count <= limit,
    remaining: Math.max(0, limit - existing.count),
  };
}

function parseApiKeyFromRequest(req: Request): string | null {
  const fromHeader = String(req.headers["x-api-key"] || "").trim();
  if (fromHeader) {
    return fromHeader;
  }

  const authorization = String(req.headers["authorization"] || "").trim();
  if (!authorization) {
    return null;
  }

  const authParts = authorization.split(" ");
  if (authParts.length === 2 && authParts[0].toLowerCase() === "apikey") {
    return authParts[1].trim();
  }

  return null;
}

function parseRawApiKey(rawKey: string): { id: string; secret: string } | null {
  const splitIndex = rawKey.indexOf(".");
  if (splitIndex === -1) return null;

  const id = rawKey.slice(0, splitIndex).trim();
  const secret = rawKey.slice(splitIndex + 1).trim();
  if (!id || !secret) return null;

  return { id, secret };
}

export default function apiKeyAuth(pool: Pool) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const rawKey = parseApiKeyFromRequest(req);
    if (!rawKey) {
      return res.status(401).json({ success: false, error: "Missing API key" });
    }

    const parsedKey = parseRawApiKey(rawKey);
    if (!parsedKey) {
      return res.status(401).json({ success: false, error: "Invalid API key format" });
    }

    const apiKeyRecord = await apiKeyHelpers.getApiKeyById(pool, parsedKey.id);
    if (!apiKeyRecord || apiKeyRecord.status !== "ACTIVE" || !apiKeyRecord.api_key_salt || !apiKeyRecord.api_key_hash) {
      return res.status(401).json({ success: false, error: "Invalid or inactive API key" });
    }

    const expectedHash = apiKeyHelpers.getApiKeyHash(parsedKey.secret, apiKeyRecord.api_key_salt);
    if (expectedHash !== apiKeyRecord.api_key_hash) {
      return res.status(401).json({ success: false, error: "Invalid or inactive API key" });
    }

    const limit = apiKeyRecord.rate_limit_per_minute ?? DEFAULT_API_RATE_LIMIT_PER_MINUTE;
    const { allowed, remaining } = await trackApiKeyRateLimit(apiKeyRecord.id!, limit);
    res.setHeader("x-rate-limit-limit", limit.toString());
    res.setHeader("x-rate-limit-remaining", remaining.toString());
    res.setHeader("x-rate-limit-window", RATE_LIMIT_WINDOW_SECONDS.toString());

    if (!allowed) {
      return res.status(429).json({
        success: false,
        error: `Rate limit exceeded. Max ${limit} requests per ${RATE_LIMIT_WINDOW_SECONDS} seconds.`,
      });
    }

    await apiKeyHelpers.recordApiKeyUsage(pool, apiKeyRecord.id!);

    (req as AuthenticatedRequest).apiKey = apiKeyRecord;
    next();
  };
}
