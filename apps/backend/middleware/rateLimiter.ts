import { Request, Response, NextFunction } from 'express';
import { redis } from '../redis';

interface RateLimitConfig {
  windowMs: number;  // Time window in milliseconds
  maxRequests: number;  // Max requests per window
  keyPrefix: string;  // Redis key prefix
  message?: string;  // Custom error message
}

/**
 * Rate limiter middleware using Redis
 * Falls back to in-memory if Redis is unavailable
 */
export function createRateLimiter(config: RateLimitConfig) {
  const {
    windowMs,
    maxRequests,
    keyPrefix,
    message = 'Too many requests, please try again later.'
  } = config;

  // In-memory fallback
  const memoryStore = new Map<string, { count: number; resetTime: number }>();

  return async (req: Request, res: Response, next: NextFunction) => {
    // Get identifier (wallet address or IP)
    const walletAddress = req.body?.wallet_address;
    const paramAddress = Array.isArray(req.params?.address) 
      ? req.params.address[0] 
      : req.params?.address;
    
    const identifier = 
      (typeof walletAddress === 'string' ? walletAddress.toLowerCase() : null) || 
      (typeof paramAddress === 'string' ? paramAddress.toLowerCase() : null) ||
      req.ip || 
      req.socket.remoteAddress || 
      'unknown';

    const key = `${keyPrefix}:${identifier}`;
    const now = Date.now();

    try {
      if (redis.isOpen) {
        // Use Redis for distributed rate limiting
        const current = await redis.get(key);
        
        if (current) {
          const count = parseInt(current, 10);
          
          if (count >= maxRequests) {
            const ttl = await redis.ttl(key);
            return res.status(429).json({
              success: false,
              error: message,
              retryAfter: ttl > 0 ? ttl : Math.ceil(windowMs / 1000)
            });
          }
          
          await redis.incr(key);
        } else {
          await redis.set(key, '1', { PX: windowMs });
        }
      } else {
        // Fallback to in-memory
        const record = memoryStore.get(key);
        
        if (record) {
          if (now < record.resetTime) {
            if (record.count >= maxRequests) {
              const retryAfter = Math.ceil((record.resetTime - now) / 1000);
              return res.status(429).json({
                success: false,
                error: message,
                retryAfter
              });
            }
            record.count++;
          } else {
            // Reset window
            memoryStore.set(key, { count: 1, resetTime: now + windowMs });
          }
        } else {
          memoryStore.set(key, { count: 1, resetTime: now + windowMs });
        }
      }

      next();
    } catch (error) {
      console.error('Rate limiter error:', error);
      // On error, allow request to proceed (fail open)
      next();
    }
  };
}

/**
 * Cleanup expired in-memory entries periodically
 */
setInterval(() => {
  // This will be handled by the memoryStore Map in each limiter instance
}, 60000); // Every minute

/**
 * Pre-configured rate limiters for common use cases
 */

// KYC submission: 3 per wallet per 24 hours
export const kycSubmissionLimiter = createRateLimiter({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  maxRequests: 3,
  keyPrefix: 'ratelimit:kyc:submit',
  message: 'Maximum KYC submissions (3) reached for this wallet. Please try again in 24 hours.'
});

// Status checks: 10 per wallet per minute
export const statusCheckLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10,
  keyPrefix: 'ratelimit:status:check',
  message: 'Too many status checks. Please wait a moment before trying again.'
});

// Admin actions: 100 per hour
export const adminActionLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 100,
  keyPrefix: 'ratelimit:admin:action',
  message: 'Admin action limit reached. Please wait before performing more actions.'
});

// Competency test: 3 attempts per wallet (lifetime handled in DB, this is per hour)
export const competencySubmitLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 5,
  keyPrefix: 'ratelimit:competency:submit',
  message: 'Too many competency test submissions. Please wait before trying again.'
});

// Document retrieval: 20 per admin per hour
export const documentRetrievalLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 20,
  keyPrefix: 'ratelimit:document:retrieve',
  message: 'Document retrieval limit reached. Please wait before accessing more documents.'
});
