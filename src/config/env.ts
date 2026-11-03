import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ quiet: true });

const stripSlash = (value: string) => value.trim().replace(/\/+$/, "");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  MONGODB_DB: z.string().min(1).default("hatey-hat"),
  CLIENT_URL: z.string().min(1, "CLIENT_URL is required"),
  AUTH_URL: z.string().optional(),
  JWKS_URL: z.string().optional(),
  JWT_ISSUER: z.string().optional(),
  JWT_AUDIENCE: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new Error(`Invalid environment configuration:\n${details}`);
}

const raw = parsed.data;
const clientOrigins = raw.CLIENT_URL.split(",").map(stripSlash).filter(Boolean);
const authUrl = stripSlash(raw.AUTH_URL || clientOrigins[0] || "");

export const env = {
  nodeEnv: raw.NODE_ENV,
  isProduction: raw.NODE_ENV === "production",
  port: raw.PORT,
  mongoUri: raw.MONGODB_URI,
  mongoDb: raw.MONGODB_DB,
  clientOrigins,
  jwt: {
    jwksUrl: raw.JWKS_URL ? stripSlash(raw.JWKS_URL) : `${authUrl}/api/auth/jwks`,
    issuer: raw.JWT_ISSUER ? stripSlash(raw.JWT_ISSUER) : authUrl,
    audience: raw.JWT_AUDIENCE ? stripSlash(raw.JWT_AUDIENCE) : authUrl,
  },
} as const;
