# Hatey Hat – API Server

> *Hate hat, ekshathe poth chola.*

Express + TypeScript REST API for **Hatey Hat**, a community-driven platform for creating, joining and tracking social service events around Dhaka.

## Stack

- Express 5 + TypeScript (ESM)
- MongoDB native driver (shares a database with Better Auth on the client)
- Zod request validation, one central JSON error handler
- `jose` JWT verification against Better Auth's JWKS endpoint
- Deployable to Vercel (`api/index.ts` + `vercel.json`)

## Getting started

```bash
npm install
cp .env.example .env   # fill in MONGODB_URI, CLIENT_URL, AUTH_URL
npm run dev            # http://localhost:5000
npm run seed           # optional: insert ~10 demo Dhaka events (safe to re-run)
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start with hot reload (tsx) |
| `npm run build` / `npm start` | Compile to `dist/` and run |
| `npm run typecheck` | Type-check only |
| `npm run seed` | Upsert demo events (idempotent) |

## Environment variables

| Variable | Description |
| --- | --- |
| `PORT` | Local port (default `5000`) |
| `MONGODB_URI` | MongoDB connection string |
| `MONGODB_DB` | Database name – must match the client's `MONGODB_DB` |
| `CLIENT_URL` | Allowed CORS origin(s), comma-separated, no trailing slash |
| `AUTH_URL` | Base URL of the Next.js app running Better Auth (JWT issuer/audience) |
| `JWKS_URL`, `JWT_ISSUER`, `JWT_AUDIENCE` | Optional overrides |

## API

All responses are JSON. Success: `{ success: true, data, message?, count? }`. Errors: `{ success: false, message, errors? }`.

| Method | Endpoint | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/health` | public | Health check (includes DB ping) |
| GET | `/api/events` | public | Upcoming events only. Query: `search`, `type`, `limit` |
| GET | `/api/events/:id` | public | Single event (+ participant count) |
| POST | `/api/events` | JWT | Create event (creator taken from the token) |
| GET | `/api/events/my` | JWT | Events created by the current user |
| PATCH | `/api/events/:id` | JWT + owner | Update event |
| DELETE | `/api/events/:id` | JWT + owner | Delete event and its joins |
| POST | `/api/events/:id/join` | JWT | Join an upcoming event (409 on duplicates) |
| GET | `/api/joins/my` | JWT | Joined events, soonest first |

Status codes: `400` validation / bad ObjectId, `401` missing or invalid token, `403` not the owner, `404` not found, `409` duplicate join, `500` unexpected.

### Auth flow

The Next.js client runs Better Auth with the `jwt` plugin. It fetches a short-lived token from `/api/auth/token` and calls this API with `Authorization: Bearer <token>`. The server verifies the signature with keys from `AUTH_URL/api/auth/jwks` and checks the issuer and audience. The user's email and name **always** come from the verified token, never from the request body.

## Data model

- **events**: `title, description, eventType, thumbnail, location, eventDate, creatorEmail, creatorName, createdAt, updatedAt`
- **joins**: `eventId, eventTitle, eventDate, eventThumbnail, eventLocation, eventType, userEmail, userName, joinedAt` – unique index on `(eventId, userEmail)`

## Deploying to Vercel

1. Import the repo in Vercel (framework preset: **Other**).
2. Add the environment variables above (`CLIENT_URL` = your client's production URL).
3. In MongoDB Atlas → Network Access, allow `0.0.0.0/0` (Vercel uses dynamic IPs).
4. Deploy, then check `https://<server>.vercel.app/api/health`.
