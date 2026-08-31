# API

## Purpose

Defines HTTP API conventions, authentication, error handling, and endpoint catalog for Kazana clients.

**Note:** Current prototype uses direct Supabase client calls. This document describes the **target API** for production (Next.js API Routes).

---

## Base URL

| Environment | Base URL |
|-------------|----------|
| Production | `https://kazana.app/api` |
| Staging | `https://staging.kazana.app/api` |
| Local | `http://localhost:3000/api` |

---

## Authentication

| Method | Header | Use case |
|--------|--------|----------|
| Supabase JWT | `Authorization: Bearer <access_token>` | User-scoped routes |
| Internal | `X-Internal-Secret` + service role | Worker-to-API only (avoid if possible) |

**Flow:**

```
Client → Supabase Auth (login) → access_token
Client → API route with Bearer token → verify via Supabase JWT secret
API → DB with user context (RLS applies)
```

---

## Conventions

### Request / response

- **Content-Type:** `application/json`
- **Dates:** ISO 8601 UTC (`2026-07-06T12:00:00Z`)
- **IDs:** UUID v4 strings
- **Pagination:** `?page=1&limit=20` → response includes `meta: { page, limit, total }`

### Errors

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": [{ "field": "companies", "message": "Required" }]
  }
}
```

| HTTP | Code | When |
|------|------|------|
| 400 | `VALIDATION_ERROR` | Invalid input |
| 401 | `UNAUTHORIZED` | Missing/invalid token |
| 403 | `FORBIDDEN` | Valid token, no permission |
| 404 | `NOT_FOUND` | Resource missing |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

---

## Endpoint catalog

### Resume Vault (target)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/resumes` | Optional | List public resumes (Discover) with filters |
| GET | `/resumes/:id` | Optional | Resume metadata (excludes private fields) |
| GET | `/resumes/mine` | Required | Current user's resumes |
| POST | `/resumes` | Required | Create resume + upload URL |
| PATCH | `/resumes/:id` | Required | Update own resume |
| DELETE | `/resumes/:id` | Required | Delete own resume |
| GET | `/lookups/companies?q=` | Public | Search companies |
| GET | `/lookups/countries?q=` | Public | Search countries |
| GET | `/lookups/universities?q=` | Public | Search universities |

### Job Discovery (planned)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/jobs` | Public | List/search jobs |
| GET | `/jobs/:id` | Public | Job detail |
| GET | `/matches` | Required | User's matched jobs |
| GET | `/preferences/notifications` | Required | Get notification prefs |
| PATCH | `/preferences/notifications` | Required | Update prefs |
| POST | `/devices` | Required | Register push token |

### System (internal)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/webhooks/stripe` | Stripe signature | Billing events |

---

## Prototype vs API mapping

| Former (direct Supabase / Vite) | Current API |
|----------------------------|------------|
| `supabase.from('resumes').select('*')` | `GET /api/resumes` |
| `supabase.from('resumes').insert()` | `POST /api/resumes` + `POST /api/resumes/upload-url` |
| `supabase.storage.upload()` | Signed URL from `POST /api/resumes/upload-url` |
| `supabase.from('jobs').select()` | `GET /api/jobs` |

Migration SHOULD preserve response shapes where possible to minimize client churn.

---

## Communication with other subsystems

| Subsystem | Role |
|-----------|------|
| [frontend.md](./frontend.md) | Primary consumer |
| [backend.md](./backend.md) | Implements routes |
| [database.md](./database.md) | Persistence |
| [security.md](./security.md) | AuthZ rules |

---

## Design principles

1. **Version prefix when breaking** — `/api/v2/` only when necessary; prefer additive changes
2. **Validate with Zod** at route boundary
3. **Never leak private fields** — `name` stripped in public resume DTOs
4. **Rate limit** public search endpoints

---

## Assumptions

- REST sufficient for v1; no GraphQL until proven need
- Mobile and web share same API

---

## Future expansion

- OpenAPI spec generated from Zod schemas
- API keys for B2B partners
- Webhooks for users ("new resume matching your criteria")

---

## Known limitations

- Prototype has no REST API — this is forward-looking

---

## Common mistakes

| Mistake | Fix |
|---------|-----|
| Different DTO shapes web vs mobile | Shared `@kazana/types` package |
| Returning stack traces in 500 | Log server-side only |
| Pagination without total count | Include `meta.total` |

---

## Related documents

- [backend.md](./backend.md)
- [database.md](./database.md)
