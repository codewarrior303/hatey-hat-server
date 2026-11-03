import http from "node:http";
import crypto from "node:crypto";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

// 1. Setup mock JWKS server
const { publicKey, privateKey } = await generateKeyPair("EdDSA", { crv: "Ed25519" });
const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "EdDSA" };
const jwksServer = http.createServer((_req, res) => {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ keys: [jwk] }));
});
await new Promise<void>((r) => jwksServer.listen(0, "127.0.0.1", r));
const authUrl = `http://127.0.0.1:${(jwksServer.address() as any).port}`;

process.env.CLIENT_URL = "http://localhost:3000";
process.env.AUTH_URL = authUrl;
process.env.MONGODB_DB = "hatey-hat-test";

const sign = (
  email: string,
  name: string,
  opts: { exp?: string; iss?: string; aud?: string; key?: any; alg?: string; kid?: string } = {},
) =>
  new SignJWT({ id: email, email, name })
    .setProtectedHeader({ alg: opts.alg || "EdDSA", kid: opts.kid ?? "k1" })
    .setSubject(email)
    .setIssuer(opts.iss ?? authUrl)
    .setAudience(opts.aud ?? authUrl)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "15m")
    .sign(opts.key ?? privateKey);

const { default: app } = await import("../app.js");
const srv = app.listen(0);
await new Promise((r) => srv.once("listening", r));
const BASE = `http://127.0.0.1:${(srv.address() as any).port}`;

async function call(method: string, path: string, body?: unknown, token?: string, headers: Record<string, string> = {}) {
  const reqHeaders: Record<string, string> = {
    "content-type": "application/json",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...headers,
  };
  const res = await fetch(BASE + path, {
    method,
    headers: reqHeaders,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, headers: res.headers, json };
}

type TestResult = { test: string; expected: string; actual: string; status: "Passed" | "Failed" };
const results: TestResult[] = [];

function record(test: string, expected: string, actual: string, passed: boolean) {
  results.push({ test, expected, actual, status: passed ? "Passed" : "Failed" });
  console.log(`${passed ? "✓ PASS" : "✗ FAIL"}: ${test} (Expected: ${expected}, Got: ${actual})`);
}

const aliceToken = await sign("alice.sec@hateyhat.org", "Alice Sec");
const bobToken = await sign("bob.sec@hateyhat.org", "Bob Sec");
const future = (d: number) => new Date(Date.now() + d * 86400000).toISOString();

const validEvent = {
  title: "Community Relief Test – Mirpur",
  description: "Valid event description for security verification suite.",
  eventType: "Donation",
  thumbnail: "https://images.unsplash.com/photo-1488521787991-ed7bbaae773c",
  location: "Mirpur 10, Dhaka",
  eventDate: future(5),
};

console.log("=== EXECUTING SECURITY VERIFICATION SUITE ROUND 2 ===\n");

// 1. JWT: No token on protected route -> 401
let r = await call("POST", "/api/events", validEvent);
record("1. No token on protected route", "401", `${r.status}`, r.status === 401);

// 2. JWT: Garbage token -> 401
r = await call("POST", "/api/events", validEvent, "not.a.real.jwt");
record("2. Garbage token returns 401", "401", `${r.status}`, r.status === 401);

// 3. JWT: Tampered signature -> 401
const [h, p, s] = aliceToken.split(".");
const tamperedToken = `${h}.${p}.${(s ?? "").slice(0, -4)}XXXX`;
r = await call("POST", "/api/events", validEvent, tamperedToken);
record("3. Tampered signature returns 401", "401", `${r.status}`, r.status === 401);

// 4. JWT: Expired token -> 401
const expiredToken = await new SignJWT({ id: "alice.sec@hateyhat.org", email: "alice.sec@hateyhat.org", name: "Alice Sec" })
  .setProtectedHeader({ alg: "EdDSA", kid: "k1" })
  .setSubject("alice.sec@hateyhat.org")
  .setIssuer(authUrl)
  .setAudience(authUrl)
  .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
  .setExpirationTime(Math.floor(Date.now() / 1000) - 1800) // Expired 30 minutes ago
  .sign(privateKey);
r = await call("POST", "/api/events", validEvent, expiredToken);
record("4. Expired token returns 401", "401", `${r.status}`, r.status === 401);

// 5. JWT: Wrong signing key -> 401
const rogueKey = await generateKeyPair("EdDSA", { crv: "Ed25519" });
const rogueToken = await sign("alice.sec@hateyhat.org", "Alice Sec", { key: rogueKey.privateKey });
r = await call("POST", "/api/events", validEvent, rogueToken);
record("5. Wrong signing key returns 401", "401", `${r.status}`, r.status === 401);

// 6. JWT: alg: none attack -> 401
const algNoneHeader = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
const algNonePayload = Buffer.from(
  JSON.stringify({ id: "evil", email: "evil@evil.com", iss: authUrl, aud: authUrl, exp: Math.floor(Date.now() / 1000) + 3600 }),
).toString("base64url");
const algNoneToken = `${algNoneHeader}.${algNonePayload}.`;
r = await call("POST", "/api/events", validEvent, algNoneToken);
record("6. alg: none attack rejected", "401", `${r.status}`, r.status === 401);

// 7. JWT: Unknown kid -> 401
const unknownKidToken = await sign("alice.sec@hateyhat.org", "Alice Sec", { kid: "non-existent-kid-99" });
r = await call("POST", "/api/events", validEvent, unknownKidToken);
record("7. Unknown kid returns 401", "401", `${r.status}`, r.status === 401);

// 8. JWT: Wrong audience -> 401
const wrongAudToken = await sign("alice.sec@hateyhat.org", "Alice Sec", { aud: "https://wrong-audience.com" });
r = await call("POST", "/api/events", validEvent, wrongAudToken);
record("8. Wrong audience returns 401", "401", `${r.status}`, r.status === 401);

// 9. JWT: Wrong issuer -> 401
const wrongIssToken = await sign("alice.sec@hateyhat.org", "Alice Sec", { iss: "https://imposter-issuer.com" });
r = await call("POST", "/api/events", validEvent, wrongIssToken);
record("9. Wrong issuer returns 401", "401", `${r.status}`, r.status === 401);

// 10. Ownership: Alice creates event; Bob tries to PATCH and DELETE (403)
const created = await call("POST", "/api/events", validEvent, aliceToken);
const eventId = created.json.data._id;

const bobPatch = await call("PATCH", `/api/events/${eventId}`, { title: "Hacked by Bob" }, bobToken);
record("10a. Bob tries to PATCH Alice's event", "403", `${bobPatch.status}`, bobPatch.status === 403);

const bobDelete = await call("DELETE", `/api/events/${eventId}`, undefined, bobToken);
record("10b. Bob tries to DELETE Alice's event", "403", `${bobDelete.status}`, bobDelete.status === 403);

const checkUnchanged = await call("GET", `/api/events/${eventId}`);
record(
  "10c. Event remains unchanged after unauthorized attempts",
  "Community Relief Test – Mirpur",
  checkUnchanged.json.data.title,
  checkUnchanged.json.data.title === "Community Relief Test – Mirpur",
);

// 11. Body Injection: Extra field creatorEmail / creatorName rejected (Zod strict)
const fakeBody = { ...validEvent, title: "Fake Creator Test", creatorEmail: "victim@example.com" };
const fakeRes = await call("POST", "/api/events", fakeBody, aliceToken);
record("11. Body with injected creatorEmail rejected (Zod strict)", "400", `${fakeRes.status}`, fakeRes.status === 400);

// 12. Future date rule: Past date rejected on Create and on Update
const pastCreate = await call(
  "POST",
  "/api/events",
  { ...validEvent, eventDate: new Date(Date.now() - 3600000).toISOString() },
  aliceToken,
);
record("12a. Create event with past date rejected", "400", `${pastCreate.status}`, pastCreate.status === 400);

const pastUpdate = await call("PATCH", `/api/events/${eventId}`, { eventDate: "2020-01-01T00:00:00.000Z" }, aliceToken);
record("12b. Update event with past date rejected", "400", `${pastUpdate.status}`, pastUpdate.status === 400);

// 13. URL Schemes: javascript:, data:, and file: URLs rejected
const jsRes = await call("POST", "/api/events", { ...validEvent, thumbnail: "javascript:alert(1)" }, aliceToken);
record("13a. javascript: thumbnail URL rejected", "400", `${jsRes.status}`, jsRes.status === 400);

const fileRes = await call("POST", "/api/events", { ...validEvent, thumbnail: "file:///etc/passwd" }, aliceToken);
record("13b. file: thumbnail URL rejected", "400", `${fileRes.status}`, fileRes.status === 400);

const dataRes = await call("POST", "/api/events", { ...validEvent, thumbnail: "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==" }, aliceToken);
record("13c. data: thumbnail URL rejected", "400", `${dataRes.status}`, dataRes.status === 400);

// 14. Query Injection: Object, array, excessive limit, long search string, and ReDoS
const nosqlRes = await call("GET", "/api/events?type[$ne]=Donation");
record("14a. NoSQL object injection in query ?type[$ne]=... rejected", "400", `${nosqlRes.status}`, nosqlRes.status === 400);

const arrayRes = await call("GET", "/api/events?type[]=Donation&type[]=Cleanup");
record("14b. Array query param ?type[]=... rejected", "400", `${arrayRes.status}`, arrayRes.status === 400);

const bigLimitRes = await call("GET", "/api/events?limit=9999");
record("14c. Excessive limit (>60) rejected", "400", `${bigLimitRes.status}`, bigLimitRes.status === 400);

const longSearchRes = await call("GET", `/api/events?search=${"A".repeat(150)}`);
record("14d. Long search string (>100 chars) rejected", "400", `${longSearchRes.status}`, longSearchRes.status === 400);

const redosRes = await call("GET", "/api/events?search=.*(.*)+$");
record("14e. ReDoS payload ?search=.*(.*)+$ handled safely with regex escape", "200", `${redosRes.status}`, redosRes.status === 200);

// 15. Duplicate join returns 409
const join1 = await call("POST", `/api/events/${eventId}/join`, undefined, bobToken);
record("15a. First join succeeds", "201", `${join1.status}`, join1.status === 201);
const join2 = await call("POST", `/api/events/${eventId}/join`, undefined, bobToken);
record("15b. Duplicate join returns 409 Conflict", "409", `${join2.status}`, join2.status === 409);

// 16. Oversized payload returns 413
const hugeString = "A".repeat(120 * 1024); // 120KB exceeds 100KB limit
const bigRes = await call("POST", "/api/events", hugeString, aliceToken);
record("16. Oversized body (>100kb) rejected with 413", "413", `${bigRes.status}`, bigRes.status === 413);

// 17. XSS payload in title, description, location: stored and retrieved safely as text (no script execution)
const xssPayload = {
  ...validEvent,
  title: "<script>alert(1)</script> Relief Drive",
  description: "<img src=x onerror=alert(1)> Community assistance in Dhaka",
  location: "<svg onload=alert(2)> Mirpur 10",
};
const xssCreated = await call("POST", "/api/events", xssPayload, aliceToken);
const xssEventId = xssCreated.json?.data?._id;
const xssFetched = await call("GET", `/api/events/${xssEventId}`);
record(
  "17. XSS payloads stored safely and returned as plain text string",
  "<script>alert(1)</script> Relief Drive",
  xssFetched.json?.data?.title,
  xssFetched.json?.data?.title === "<script>alert(1)</script> Relief Drive",
);
await call("DELETE", `/api/events/${xssEventId}`, undefined, aliceToken);

// 18. Distributed MongoDB-backed Rate Limiter (holds across cold starts / shared storage)
let hit429 = false;
let retryAfterHeader = "";
for (let i = 0; i < 45; i++) {
  const wr = await call("DELETE", `/api/events/000000000000000000000000`, undefined, aliceToken);
  if (wr.status === 429) {
    hit429 = true;
    retryAfterHeader = wr.headers.get("retry-after") || "";
    break;
  }
}
record("18a. Distributed write limiter triggers 429", "429", hit429 ? "429" : "no 429", hit429);
record("18b. 429 response includes Retry-After header", "present", retryAfterHeader ? "present" : "missing", Boolean(retryAfterHeader));

// 19. CORS: unknown origin gets no CORS headers; allowed origin works
const corsBlocked = await fetch(BASE + "/api/health", { headers: { origin: "https://malicious-site.com" } });
record("19a. Unknown origin gets no Access-Control-Allow-Origin", "null", `${corsBlocked.headers.get("access-control-allow-origin")}`, corsBlocked.headers.get("access-control-allow-origin") === null);

const corsAllowed = await fetch(BASE + "/api/health", { headers: { origin: "http://localhost:3000" } });
record("19b. Allowed origin gets correct Access-Control-Allow-Origin", "http://localhost:3000", `${corsAllowed.headers.get("access-control-allow-origin")}`, corsAllowed.headers.get("access-control-allow-origin") === "http://localhost:3000");

// 20. Security headers (Helmet on server)
const srvHeaders = await fetch(BASE + "/api/health");
record("20a. Server sends X-Content-Type-Options: nosniff", "nosniff", `${srvHeaders.headers.get("x-content-type-options")}`, srvHeaders.headers.get("x-content-type-options") === "nosniff");
record("20b. Server sends Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload", `${srvHeaders.headers.get("strict-transport-security")}`, srvHeaders.headers.get("strict-transport-security") === "max-age=31536000; includeSubDomains; preload");
record("20c. Server sends X-Frame-Options: DENY", "DENY", `${srvHeaders.headers.get("x-frame-options")}`, srvHeaders.headers.get("x-frame-options") === "DENY");
record("20d. Server sends X-Request-Id header", "present", srvHeaders.headers.get("x-request-id") ? "present" : "missing", Boolean(srvHeaders.headers.get("x-request-id")));

// Clean up initial test event
await call("DELETE", `/api/events/${eventId}`, undefined, aliceToken);

console.log("\n=== SECURITY AUDIT VERIFICATION RESULTS TABLE ===");
console.table(results);

srv.close();
jwksServer.close();
const { getDb, closeDb } = await import("../db/client.js");
try {
  const testDb = await getDb();
  await testDb.dropDatabase();
  console.log("Cleaned up temporary test database 'hatey-hat-test'.");
} catch (err) {
  console.error("Failed to drop test database:", err);
}
await closeDb();

const allPassed = results.every((r) => r.status === "Passed");
console.log(`\nOverall Security Test Status: ${allPassed ? "ALL TESTS PASSED (100%)" : "FAILURES DETECTED"}`);
process.exit(allPassed ? 0 : 1);
