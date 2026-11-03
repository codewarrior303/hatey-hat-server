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
  await Promise.all([
    db.collection("events").createIndex({ eventDate: 1 }),
    db.collection("events").createIndex({ creatorEmail: 1, eventDate: 1 }),
    db.collection("joins").createIndex({ eventId: 1, userEmail: 1 }, { unique: true, name: "unique_event_user" }),
    db.collection("joins").createIndex({ userEmail: 1, eventDate: 1 }),
  ]);
  cache.indexesReady = true;
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
