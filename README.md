# Hatey Hat – API Server 🤝

> **"Hate hat, ekshathe poth chola."**  
> High-performance Express & TypeScript REST API powering **Hatey Hat** — a community-driven social welfare and grassroots initiative management platform designed for neighbourhoods across Dhaka, Bangladesh.

[![Node.js](https://img.shields.io/badge/Node.js-20+-68a063?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-5.x-black?style=flat-square&logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Native%20Driver-47a248?style=flat-square&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=flat-square&logo=vercel&logoColor=white)](https://hatey-hat-api.vercel.app)

**Live Production API:** [https://hatey-hat-api.vercel.app](https://hatey-hat-api.vercel.app)

---

## Architecture & Core Features

- **Event Scheduling Conflict Protection:** Enforces strict validation preventing overlapping events with the same category (`eventType`) and same location on the same calendar day (UTC & local time boundary). Guarantees grassroots initiatives do not fragment volunteer resources.
- **Enterprise-Grade MongoDB Engine:** Utilizes the official native MongoDB driver with global connection pooling and automatic idempotent index provisioning (compound conflict indexes, unique join constraints, and automated TTL cleanup).
- **Cryptographic JWT Authentication:** Verifies client JWT bearer tokens issued by Better Auth using `jose` against asymmetric JWKS endpoints with zero hardcoded secret leakage.
- **Granular Rate Limiting & DoS Mitigation:** Multi-tiered rate limiters with MongoDB TTL backend:
  - Strict write limiter (`POST /api/events`, `POST /api/joins`, `POST /api/subscribers`)
  - Dynamic search query limiter
  - Public stats & discovery limiter
- **Automated Security Audit Trail:** Every event creation, update, deletion, join, and unauthorized access attempt is recorded with client IP, user ID, path, and timestamp, preserved for 30 days via MongoDB TTL indexes.
- **Type-Safe Input Validation:** Every incoming payload and query parameter is validated against strict Zod schemas before reaching business logic.
- **Unified JSON Error Handling:** Centralized middleware standardizes all API errors to `{ success: false, message, errors? }` with precise RFC-compliant HTTP status codes (400, 401, 403, 404, 409, 429, 500).

---

## Database Indexes

| Collection | Index Key | Type / Purpose |
| :--- | :--- | :--- |
| `events` | `{ eventDate: 1 }` | Fast chronological queries for upcoming initiatives |
| `events` | `{ creatorEmail: 1, eventDate: 1 }` | Fast organizer dashboard indexing |
| `events` | `{ eventType: 1, location: 1, eventDate: 1 }` | High-speed conflict lookup on creation & update |
| `joins` | `{ eventId: 1, userEmail: 1 }` | **Unique Constraint:** Prevents duplicate event joins |
| `joins` | `{ userEmail: 1, eventDate: 1 }` | User's joined events timeline |
| `rate_limits` | `{ expireAt: 1 }` | **TTL Index (0s):** Auto-prunes expired rate limit windows |
| `security_audit`| `{ timestamp: 1 }` | **TTL Index (30 days):** Automatic compliance data retention |
| `security_audit`| `{ action: 1, timestamp: -1 }` | Fast security audit lookups |
| `subscribers` | `{ email: 1 }` | **Unique Constraint:** Prevents duplicate newsletter signups |

---

## API Endpoints Reference

### 1. Events (`/api/events`)
| Method | Route | Auth Required | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/events` | No | Fetch upcoming initiatives. Supports `?search=`, `?type=`, and `?limit=`. |
| `GET` | `/api/events/:id` | No | Fetch single event details with participant roster. |
| `POST` | `/api/events` | **Yes (JWT)** | Create new initiative. Enforces conflict validation and rate limiting. |
| `PATCH`| `/api/events/:id` | **Yes (Owner)**| Update initiative. Owner-only check with conflict re-validation. |
| `DELETE`| `/api/events/:id`| **Yes (Owner)**| Delete initiative. Cascades and deletes corresponding join records. |
| `GET` | `/api/events/creator/:email` | **Yes (JWT)** | Fetch all initiatives created by the organizer. |

### 2. Event Participation (`/api/joins`)
| Method | Route | Auth Required | Description |
| :--- | :--- | :---: | :--- |
| `POST` | `/api/joins` | **Yes (JWT)** | Join an upcoming event. Prevented if already joined. |
| `DELETE`| `/api/joins/:eventId` | **Yes (JWT)** | Cancel participation / leave event. |
| `GET` | `/api/joins/user/:email` | **Yes (JWT)** | Retrieve all events joined by the logged-in user. |
| `GET` | `/api/joins/event/:eventId` | No | Retrieve list of participants for an initiative. |

### 3. Community Newsletter (`/api/subscribers`)
| Method | Route | Auth Required | Description |
| :--- | :--- | :---: | :--- |
| `POST` | `/api/subscribers` | No | Subscribe to community updates with email format validation. |

### 4. Platform Metrics (`/api/stats`)
| Method | Route | Auth Required | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/stats` | No | Live counters: active initiatives, volunteers joined, and community categories. |


---

## License

This project is licensed under the [MIT License](LICENSE).
