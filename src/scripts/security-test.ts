import http from "node:http";
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

const sign = (email: string, name: string, opts: { exp?: string; iss?: string; aud?: string; key?: any; alg?: string } = {}) =>
  new SignJWT({ id: email, email, name })
    .setProtectedHeader({ alg: opts.alg || "EdDSA", kid: "k1" })
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

// Test 1: No token on protected route returns 401
let r = await call("POST", "/api/events", validEvent);
record("1. No token on protected route", "401", `${r.status}`, r.status === 401);

// Test 2: Garbage token returns 401
r = await call("POST", "/api/events", validEvent, "not.a.real.jwt");
record("2. Garbage token returns 401", "401", `${r.status}`, r.status === 401);

// Test 3: Tampered signature returns 401
const [h, p, s] = aliceToken.split(".");
const tamperedToken = `${h}.${p}.${(s ?? "").slice(0, -4)}XXXX`;
r = await call("POST", "/api/events", validEvent, tamperedToken);
record("3. Tampered signature returns 401", "401", `${r.status}`, r.status === 401);

// Test 4: Expired token returns 401
const expiredToken = await sign("alice.sec@hateyhat.org", "Alice Sec", { exp: "1s" });
await new Promise((res) => setTimeout(res, 2000));
r = await call("POST", "/api/events", validEvent, expiredToken);
record("4. Expired token returns 401", "401", `${r.status}`, r.status === 401);

// Test 5: Wrong issuer / untrusted key returns 401
const rogueKey = await generateKeyPair("EdDSA", { crv: "Ed25519" });
const rogueToken = await sign("alice.sec@hateyhat.org", "Alice Sec", { key: rogueKey.privateKey });
r = await call("POST", "/api/events", validEvent, rogueToken);
record("5. Wrong signing key returns 401", "401", `${r.status}`, r.status === 401);

// Test 6: Create event as Alice, then Bob tries to PATCH and DELETE (expect 403)
const created = await call("POST", "/api/events", validEvent, aliceToken);
const eventId = created.json.data._id;

const bobPatch = await call("PATCH", `/api/events/${eventId}`, { title: "Hacked by Bob" }, bobToken);
record("6a. Bob tries to PATCH Alice's event", "403", `${bobPatch.status}`, bobPatch.status === 403);

const bobDelete = await call("DELETE", `/api/events/${eventId}`, undefined, bobToken);
record("6b. Bob tries to DELETE Alice's event", "403", `${bobDelete.status}`, bobDelete.status === 403);

// Verify event is unchanged
const checkUnchanged = await call("GET", `/api/events/${eventId}`);
record("6c. Event remains unchanged", "Community Relief Test – Mirpur", checkUnchanged.json.data.title, checkUnchanged.json.data.title === "Community Relief Test – Mirpur");

// Test 7: Fake creatorEmail in request body
const fakeBody = { ...validEvent, title: "Fake Creator Test", creatorEmail: "victim@example.com" };
const fakeRes = await call("POST", "/api/events", fakeBody, aliceToken);
record("7. Body with extra field creatorEmail rejected (Zod strict)", "400", `${fakeRes.status}`, fakeRes.status === 400);

// Test 8: Past date-time rejected
const pastRes = await call("POST", "/api/events", { ...validEvent, eventDate: new Date(Date.now() - 3600000).toISOString() }, aliceToken);
record("8. Create event with past date rejected", "400", `${pastRes.status}`, pastRes.status === 400);

// Test 9: javascript: thumbnail URL rejected
const xssRes = await call("POST", "/api/events", { ...validEvent, thumbnail: "javascript:alert(1)" }, aliceToken);
record("9. javascript: thumbnail URL rejected", "400", `${xssRes.status}`, xssRes.status === 400);

// Test 10: ?type[$ne]=x and ReDoS style input
const nosqlRes = await call("GET", "/api/events?type[$ne]=Donation");
record("10a. NoSQL object injection in query ?type[$ne]=... rejected", "400", `${nosqlRes.status}`, nosqlRes.status === 400);

const redosRes = await call("GET", "/api/events?search=.*(.*)+$");
record("10b. ReDoS payload ?search=.*(.*)+$ handled safely", "200", `${redosRes.status}`, redosRes.status === 200);

// Test 11: Duplicate join returns 409
const join1 = await call("POST", `/api/events/${eventId}/join`, undefined, bobToken);
const join2 = await call("POST", `/api/events/${eventId}/join`, undefined, bobToken);
record("11. Duplicate join returns 409", "409", `${join2.status}`, join2.status === 409);

// Test 12: Oversized body is rejected
const hugeString = "A".repeat(120 * 1024); // 120KB exceeds 100KB limit
const bigRes = await call("POST", "/api/events", hugeString, aliceToken);
record("12. Oversized body (>100kb) rejected", "413", `${bigRes.status}`, bigRes.status === 413);

// Test 13: Rate limiter triggers on rapid requests
let hit429 = false;
for (let i = 0; i < 70; i++) {
  const wr = await call("DELETE", `/api/events/000000000000000000000000`, undefined, aliceToken);
  if (wr.status === 429) {
    hit429 = true;
    break;
  }
}
record("13. Rate limit triggered on rapid writes", "429", hit429 ? "429" : "no 429", hit429);

// Test 14: CORS blocks unknown origin
const corsRes = await fetch(BASE + "/api/health", { headers: { origin: "https://malicious-site.com" } });
const corsHeader = corsRes.headers.get("access-control-allow-origin");
record("14. Unknown origin gets no CORS allow-origin", "null", `${corsHeader}`, corsHeader === null);

// Test 15: Security headers (Helmet on server)
const srvHeaders = await fetch(BASE + "/api/health");
const nosniff = srvHeaders.headers.get("x-content-type-options");
record("15. Server has security headers (Helmet)", "nosniff", `${nosniff}`, nosniff === "nosniff");

// Clean up test event created for test 6
await call("DELETE", `/api/events/${eventId}`, undefined, aliceToken);

console.log("\n=== SECURITY AUDIT TEST RESULTS ===");
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
process.exit(allPassed ? 0 : 1);
