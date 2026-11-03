import { getDb } from "../db/client.js";

export interface SecurityAuditEntry {
  action:
    | "login_failure"
    | "event_created"
    | "event_updated"
    | "event_deleted"
    | "event_joined"
    | "forbidden_access_attempt"
    | "rate_limit_exceeded"
    | "unauthorized_token";
  ip: string;
  userId?: string | null;
  userEmail?: string | null;
  path?: string;
  method?: string;
  details?: Record<string, unknown>;
  timestamp?: Date;
}

/**
 * Persists security-relevant actions to the MongoDB `security_audit` collection
 * and writes a structured stdout log line.
 * Automatically strips sensitive parameters to prevent accidental leakage.
 */
export async function logSecurityAudit(entry: SecurityAuditEntry): Promise<void> {
  const auditDoc = {
    ...entry,
    timestamp: entry.timestamp || new Date(),
  };

  // Structured stdout log line (clean, machine-readable)
  const safeLog = {
    level: "AUDIT",
    time: auditDoc.timestamp.toISOString(),
    action: auditDoc.action,
    ip: auditDoc.ip,
    path: auditDoc.path,
    method: auditDoc.method,
    userId: auditDoc.userId || undefined,
    userEmail: auditDoc.userEmail ? `${auditDoc.userEmail.split("@")[0]}@***` : undefined,
  };
  console.info(`[SECURITY_AUDIT] ${JSON.stringify(safeLog)}`);

  // Persist to MongoDB security_audit collection (fail-safe)
  try {
    const db = await getDb();
    await db.collection("security_audit").insertOne(auditDoc);
  } catch (err) {
    // Audit logging failure must never crash the primary request
    console.warn("[auditLogger] Failed to persist audit doc to MongoDB:", (err as any)?.message || err);
  }
}
