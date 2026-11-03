import type { RequestHandler } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import { logSecurityAudit } from "../utils/auditLogger.js";
import { getClientIp } from "./rateLimiter.js";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  image?: string | null;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      id?: string;
    }
  }
}

// Remote key set is cached in module scope; jose handles key rotation and caching.
// When an unseen `kid` arrives, jose automatically attempts to fetch fresh keys.
const JWKS = createRemoteJWKSet(new URL(env.jwt.jwksUrl), {
  cooldownDuration: 30_000,
  cacheMaxAge: 10 * 60_000,
});

type BetterAuthPayload = JWTPayload & {
  id?: string;
  email?: string;
  name?: string;
  image?: string | null;
};

/**
 * Verifies `Authorization: Bearer <jwt>` issued by Better Auth's jwt plugin.
 * Strictly verifies signature, expiration, not-before, algorithm allowlist,
 * issuer, and audience with a 15-second clock skew tolerance.
 */
export const verifyJwt: RequestHandler = async (req, res, next) => {
  // Enforce no-store on authenticated API routes to prevent sensitive token/user caching
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");

  const header = req.headers.authorization;
  const clientIp = getClientIp(req);

  if (!header?.startsWith("Bearer ")) {
    return next(ApiError.unauthorized("Missing or malformed Authorization header"));
  }
  const token = header.slice("Bearer ".length).trim();
  if (!token) return next(ApiError.unauthorized("Missing access token"));

  try {
    const { payload } = await jwtVerify<BetterAuthPayload>(token, JWKS, {
      issuer: env.jwt.issuer,
      audience: env.jwt.audience,
      algorithms: ["EdDSA", "RS256", "ES256"], // Strict asymmetric allowlist: rejects 'none', 'HS256', etc.
      clockTolerance: "15s",
    });

    const email = payload.email?.toLowerCase();
    const id = payload.id ?? payload.sub;
    if (!email || !id) {
      await logSecurityAudit({
        action: "unauthorized_token",
        ip: clientIp,
        path: req.originalUrl,
        method: req.method,
        details: { reason: "Missing essential user claims (email or sub/id)" },
      }).catch(() => {});
      return next(ApiError.unauthorized("Token is missing required user claims"));
    }

    req.user = {
      id,
      email,
      name: payload.name?.trim() || email.split("@")[0]!,
      image: payload.image ?? null,
    };

    next();
  } catch (error) {
    const code = (error as { code?: string }).code;
    let message = "Invalid or untrusted access token";

    if (code === "ERR_JWT_EXPIRED") {
      message = "Session token expired. Please refresh your session.";
    } else if (code === "ERR_JWT_CLAIM_VALIDATION_FAILED") {
      message = "Token claim validation failed (issuer, audience, or time mismatch).";
    } else if (code === "ERR_JWS_SIGNATURE_VERIFICATION_FAILED") {
      message = "Token signature verification failed.";
    } else if (code === "ERR_JOSE_NOT_SUPPORTED" || code === "ERR_JWS_INVALID") {
      message = "Unsupported token format or algorithm.";
    }

    await logSecurityAudit({
      action: "unauthorized_token",
      ip: clientIp,
      path: req.originalUrl,
      method: req.method,
      details: { code, message },
    }).catch(() => {});

    next(ApiError.unauthorized(message));
  }
};
