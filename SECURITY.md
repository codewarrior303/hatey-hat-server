# Security Policy – Hatey Hat Server API

## Reporting a Vulnerability

If you discover a security vulnerability in the Hatey Hat API, please report it privately rather than opening a public GitHub issue.

- **Primary Contact**: `security@hateyhat.org`
- **Response Target**: We acknowledge all reports within 24 hours and aim to release a patched version within 72 hours.
- **Scope**:
  - Express.js API endpoints (`/api/*`)
  - MongoDB queries and data isolation
  - JWT verification and JWKS authentication
  - Rate limiting, CORS, and request protection

Please include:
1. Description of the issue and potential impact
2. Minimal reproduction steps, request payloads, or curl commands
3. Expected versus actual behavior

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Security Controls Overview

1. **Authentication & Authorization**:
   - Asymmetric JWT verification against Better Auth JWKS endpoint (`EdDSA`, `RS256`, `ES256`).
   - Short token lifetimes (15 minutes).
   - Strict resource ownership verification on all state-modifying routes.
2. **Rate Limiting**:
   - Distributed MongoDB-backed counters (`rate_limits` collection with TTL indexes).
   - Dedicated limits on writes, search queries, and public metrics.
3. **Input Validation**:
   - Zod strict schemas on all inputs. Rejects unknown keys, scripts, and injection attempts.
   - Regex escaping on search inputs to eliminate ReDoS risks.
4. **Headers & Network**:
   - Helmet security headers: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`.
   - `trust proxy: 1` configured for Vercel edge reverse proxies.
   - Origin-locked CORS.
