import type { Request, Response, NextFunction, RequestHandler } from "express";
import { getDb } from "../db/client.js";
import { logSecurityAudit } from "../utils/auditLogger.js";

interface MongoRateLimiterOptions {
  windowMs: number;
  max: number;
  keyPrefix: string;
  message?: string;
}

/** Extracts the authentic client IP accounting for Vercel edge reverse proxies. */
export function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    // When trust proxy = 1, the first element of X-Forwarded-For represents the client
    const ip = forwarded.split(",")[0]?.trim();
    if (ip) return ip;
  }
  return (req.headers["x-real-ip"] as string) || req.ip || req.socket.remoteAddress || "127.0.0.1";
}

/**
 * Creates a MongoDB-backed atomic distributed rate limiter middleware.
 * Stores counters in the `rate_limits` collection with an automated TTL index.
 *
 * Fail-Open Design Strategy:
 * If the MongoDB rate-limit store times out or becomes unreachable, the limiter logs a warning
 * and calls `next()` to avoid disrupting legitimate user operations during transient DB blips.
 */
export function createMongoRateLimiter(options: MongoRateLimiterOptions): RequestHandler {
  const { windowMs, max, keyPrefix, message = "Too many requests. Please try again later." } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const clientIp = getClientIp(req);
      const key = `${keyPrefix}:${clientIp}`;
      const now = Date.now();
      const expireAt = new Date(now + windowMs);

      const db = await getDb();
      const collection = db.collection("rate_limits");

      // Atomic findOneAndUpdate with upsert
      const result = await collection.findOneAndUpdate(
        { _id: key as any },
        {
          $inc: { count: 1 },
          $setOnInsert: { expireAt, createdAt: new Date(now) },
        },
        { upsert: true, returnDocument: "after" },
      );

      const currentCount = result?.count ?? 1;
      const remaining = Math.max(0, max - currentCount);
      const resetTime = result?.expireAt ? new Date(result.expireAt).getTime() : now + windowMs;
      const retryAfterSeconds = Math.max(1, Math.ceil((resetTime - now) / 1000));

      res.setHeader("X-RateLimit-Limit", max);
      res.setHeader("X-RateLimit-Remaining", remaining);
      res.setHeader("X-RateLimit-Reset", Math.ceil(resetTime / 1000));

      if (currentCount > max) {
        res.setHeader("Retry-After", retryAfterSeconds);

        // Record security audit entry
        await logSecurityAudit({
          action: "rate_limit_exceeded",
          ip: clientIp,
          path: req.originalUrl,
          method: req.method,
          details: { limit: max, windowMs, currentCount },
        }).catch(() => {});

        return res.status(429).json({
          success: false,
          message,
          retryAfter: retryAfterSeconds,
        });
      }

      next();
    } catch (err) {
      // Deliberate Fail-Open Strategy documented
      console.warn(`[rateLimiter] Fail-open strategy triggered on ${keyPrefix}:`, (err as any)?.message || err);
      next();
    }
  };
}

/** General public API rate limiter (300 requests / 15 minutes) */
export const apiLimiter = createMongoRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 300,
  keyPrefix: "api",
  message: "Too many requests from this IP. Please slow down and try again later.",
});

/** Strict write limiter for create/edit/delete/join (40 requests / 15 minutes) */
export const writeLimiter = createMongoRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 40,
  keyPrefix: "write",
  message: "Action rate limit reached. Please wait a few minutes before submitting again.",
});

/** Search limiter to prevent scraping and regex denial-of-service (45 requests / 1 minute) */
export const searchLimiter = createMongoRateLimiter({
  windowMs: 60 * 1000,
  max: 45,
  keyPrefix: "search",
  message: "Search query rate limit reached. Please wait a moment before searching again.",
});

/** Stats endpoint limiter (30 requests / 1 minute) */
export const statsLimiter = createMongoRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  keyPrefix: "stats",
  message: "Metrics rate limit reached. Please wait a moment.",
});
