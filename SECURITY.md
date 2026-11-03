# Security Policy – Hatey Hat Express API

## Reporting a Vulnerability

If you discover a security vulnerability in the Hatey Hat Express API, please report it privately through GitHub:

- **Security Advisory URL**: [Report a Vulnerability](https://github.com/codewarrior303/hatey-hat-server/security/advisories/new)
- **Response Window**: Initial acknowledgment within 24 hours. Critical patches released within 72 hours.
- **Scope**:
  - Express.js HTTP API, routing, and controllers
  - Distributed MongoDB-backed rate limiters
  - JWT verification, JWKS caching, and claim validation
  - MongoDB queries, Zod validation schemas, and database constraints

Please provide:
- Steps to reproduce
- Sample payloads or requests (cURL, script)
- Expected vs. actual behavior
- Impact and severity assessment

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

## Security Controls Overview

1. **Authentication & Authorization**:
   - Asymmetric JWT verification against Better Auth JWKS endpoint.
   - Algorithms restricted to `EdDSA`, `RS256`, `ES256`.
   - Event mutation (PUT, DELETE) strictly requires ownership matching `event.creatorEmail === req.user.email`.
2. **Rate Limiting**:
   - Distributed atomic counters in MongoDB collection `rate_limits` with automatic TTL cleanup.
   - IP extraction via trusted edge proxy (`trust proxy: 1`).
   - Rate limit responses include `X-RateLimit-*` and standard `Retry-After` headers.
3. **Injection Prevention**:
   - Strict Zod schemas with regex escaping on text search queries.
   - Array and object-shaped query parameter filtering.
   - Strictly enforced URL scheme whitelisting for images (`http:`, `https:` only; `javascript:`, `data:`, `file:` rejected).
4. **Data Protection**:
   - Sensitive headers, tokens, and credentials stripped from all application logs.
   - Structured audit logging to MongoDB collection `security_audit` (30-day TTL).
   - Production errors sanitize internal exception messages and stack traces.
