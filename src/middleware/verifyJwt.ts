import type { RequestHandler } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

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
    }
  }
}

// Remote key set is cached in module scope; jose handles key rotation and caching.
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

/** Verifies `Authorization: Bearer <jwt>` issued by Better Auth's jwt plugin and attaches `req.user`. */
export const verifyJwt: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(ApiError.unauthorized("Missing or malformed Authorization header"));
  }
  const token = header.slice("Bearer ".length).trim();
  if (!token) return next(ApiError.unauthorized("Missing access token"));

  try {
    const { payload } = await jwtVerify<BetterAuthPayload>(token, JWKS, {
      issuer: env.jwt.issuer,
      audience: env.jwt.audience,
      algorithms: ["EdDSA", "RS256", "ES256"],
    });

    const email = payload.email?.toLowerCase();
    const id = payload.id ?? payload.sub;
    if (!email || !id) return next(ApiError.unauthorized("Token is missing user claims"));

    req.user = { id, email, name: payload.name?.trim() || email.split("@")[0]!, image: payload.image ?? null };
    next();
  } catch (error) {
    const code = (error as { code?: string }).code;
    const message =
      code === "ERR_JWT_EXPIRED" ? "Session token expired. Please try again." : "Invalid or untrusted access token";
    next(ApiError.unauthorized(message));
  }
};
