import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { getDb } from "./db/client.js";
import eventsRouter from "./routes/events.routes.js";
import joinsRouter from "./routes/joins.routes.js";

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser clients (curl, server-side fetch) which send no Origin header.
      if (!origin || env.clientOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 600,
  }),
);
app.use(express.json({ limit: "100kb" }));

app.get("/", (_req, res) => {
  res.json({ success: true, message: "Hatey Hat API is running. Hate hat, ekshathe poth chola." });
});

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

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
