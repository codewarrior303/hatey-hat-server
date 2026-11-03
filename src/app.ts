import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { apiLimiter } from "./middleware/rateLimiter.js";
import { getDb } from "./db/client.js";
import eventsRouter from "./routes/events.routes.js";
import joinsRouter from "./routes/joins.routes.js";
import subscribersRouter from "./routes/subscribers.routes.js";

const app = express();

app.disable("x-powered-by");
// Trust 1st hop from Vercel edge reverse proxy so req.ip represents the authentic client IP
app.set("trust proxy", 1);

// Security Headers via Helmet
app.use(
  helmet({
    contentSecurityPolicy: false, // CSP is managed at the client Next.js layer
    crossOriginEmbedderPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    frameguard: { action: "deny" },
    noSniff: true,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  }),
);

// Request ID and structured request logger (never prints passwords, cookies, or tokens)
app.use((req, res, next) => {
  const reqId = crypto.randomUUID();
  req.id = reqId;
  res.setHeader("X-Request-Id", reqId);

  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    const userPart = req.user?.id ? `[user:${req.user.id}]` : "[anon]";
    console.info(`[${reqId}] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms ${userPart}`);
  });

  next();
});

// Strict CORS: allows non-browser health pings or exact verified client origins
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || env.clientOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
    maxAge: 600,
  }),
);

// Body parsing with 100kb limit
app.use(express.json({ limit: "100kb" }));

// Distributed MongoDB-backed API rate limiter
app.use(apiLimiter);

// Root Welcome Route
app.get("/", (_req, res) => {
  res.json({ success: true, message: "Hatey Hat API is running. Hate hat, ekshathe poth chola." });
});

// Health check with real database ping
app.get("/api/health", async (_req, res) => {
  let database: "up" | "down" = "down";
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    database = "up";
  } catch {
    database = "down";
  }
  res.status(database === "up" ? 200 : 503).json({
    success: database === "up",
    data: { status: database === "up" ? "ok" : "degraded", database, timestamp: new Date().toISOString() },
  });
});

app.use("/api/events", eventsRouter);
app.use("/api/joins", joinsRouter);
app.use("/api/subscribers", subscribersRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
