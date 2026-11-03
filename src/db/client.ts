import { MongoClient, type Db } from "mongodb";
import { env } from "../config/env.js";

/**
 * Cached MongoDB connection.
 * On Vercel each serverless instance re-uses the module scope between
 * invocations, so we keep a single client promise on `globalThis`.
 */
type MongoCache = { client: MongoClient | null; promise: Promise<MongoClient> | null; indexesReady: boolean };

const globalForMongo = globalThis as unknown as { __hateyHatMongo?: MongoCache };
const cache: MongoCache =
  globalForMongo.__hateyHatMongo ?? (globalForMongo.__hateyHatMongo = { client: null, promise: null, indexesReady: false });

async function ensureIndexes(db: Db) {
  if (cache.indexesReady) return;
  try {
    await Promise.all([
      // Events indexes
      db.collection("events").createIndex({ eventDate: 1 }, { name: "idx_events_eventDate" }),
      db.collection("events").createIndex({ creatorEmail: 1, eventDate: 1 }, { name: "idx_events_creator_date" }),

      // Joins unique constraint index (prevents duplicate joins at the database layer)
      db.collection("joins").createIndex({ eventId: 1, userEmail: 1 }, { unique: true, name: "unique_event_user" }),
      db.collection("joins").createIndex({ userEmail: 1, eventDate: 1 }, { name: "idx_joins_user_date" }),

      // Rate limit counters TTL index (automatically drops expired rate limit records)
      db.collection("rate_limits").createIndex({ expireAt: 1 }, { expireAfterSeconds: 0, name: "ttl_rate_limits" }),

      // Security audit log TTL index (automatically retains audit logs for 30 days)
      db.collection("security_audit").createIndex(
        { timestamp: 1 },
        { expireAfterSeconds: 60 * 60 * 24 * 30, name: "ttl_security_audit" },
      ),
      db.collection("security_audit").createIndex({ action: 1, timestamp: -1 }, { name: "idx_audit_action_time" }),
    ]);
    cache.indexesReady = true;
  } catch (err) {
    console.warn("[db] Non-fatal warning when ensuring indexes:", (err as any)?.message || err);
  }
}

export async function getDb(): Promise<Db> {
  if (!cache.promise) {
    const client = new MongoClient(env.mongoUri, { maxPoolSize: 10, serverSelectionTimeoutMS: 8000 });
    cache.promise = client.connect().then((connected) => {
      cache.client = connected;
      return connected;
    });
    cache.promise.catch(() => {
      // Allow a retry on the next request if the first connection fails.
      cache.promise = null;
    });
  }
  const client = await cache.promise;
  const db = client.db(env.mongoDb);
  await ensureIndexes(db);
  return db;
}

export async function closeDb() {
  if (cache.client) await cache.client.close();
  cache.client = null;
  cache.promise = null;
  cache.indexesReady = false;
}
