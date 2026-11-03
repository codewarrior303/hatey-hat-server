# Hatey Hat – API Server

> *Hate hat, ekshathe poth chola.*

Express + TypeScript REST API for **Hatey Hat**, a community-driven platform for creating, joining and tracking social service events around Dhaka.

**Live API URL:** [https://hatey-hat-api.vercel.app](https://hatey-hat-api.vercel.app)  

## Stack

- Express 5 + TypeScript (ESM)
- MongoDB native driver (shares a database with Better Auth on the client)
- Zod request validation, one central JSON error handler
- `jose` JWT verification against Better Auth's JWKS endpoint
- Deployable to Vercel (`api/index.ts` + `vercel.json`)

