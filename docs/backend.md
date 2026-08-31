# Backend

## Purpose

Defines server-side architecture: API routes, edge functions, background workers, and how they orchestrate business logic.

---

## Backend responsibilities

| Responsibility | Owner (target) | Prototype today |
|----------------|----------------|-----------------|
| Input validation | API routes | Client-only validation |
| Authorization checks | API + RLS | RLS only |
| Job ingestion | Workers | Not implemented |
| Matching | Workers | Not implemented |
| Push dispatch | Workers + Edge | Not implemented |
| Webhooks (Stripe) | Edge Functions | Not implemented |
| Rate limiting | API middleware | None |

---

## API tier (Next.js API Routes — preferred)

```
Client Request
      │
      ▼
┌─────────────────┐
│ Middleware      │  Auth session, rate limit, CORS
└────────┬────────┘
         ▼
┌─────────────────┐
│ Route Handler   │  Validate (Zod) → Service → Repository
└────────┬────────┘
         ▼
┌─────────────────┐
│ Supabase / DB   │
└─────────────────┘
```

### WHY Next.js API Routes

| Pro | Con (accepted) |
|-----|----------------|
| Same repo and deploy as web | Cold starts on serverless |
| TypeScript end-to-end | Less ideal for CPU-heavy matching at huge scale |
| Vercel integration | Vendor coupling (mitigated: handlers are portable logic) |

**Rejected:** Standalone Express/Fastify service — extra deployable, monitoring, and hiring surface for a 1–3 person team.

**Rejected:** GraphQL server — premature; REST + typed clients sufficient until mobile + web query divergence is painful.

---

## Layering convention

| Layer | Responsibility | Example |
|-------|----------------|---------|
| **Route** | HTTP, status codes, parse body | `POST /api/resumes` |
| **Service** | Business rules | Auto-generate resume name |
| **Repository** | SQL / Supabase calls | `insertResume()` |

Routes MUST NOT contain raw SQL. Services MUST NOT parse HTTP.

---

## Supabase Edge Functions

Use for:

- Webhook receivers (Stripe, ingestion callbacks)
- Short-lived transforms (< 30s)
- Operations needing service role but not long compute

Do NOT use for:

- Bulk job ingestion (use workers)
- Matching batch runs

---

## Background workers / cron

```
┌──────────────┐     schedule      ┌──────────────┐
│ Cron trigger │ ────────────────► │ Ingestion    │
│ (Vercel cron │                   │ worker       │
│  or Supabase)│                   └──────┬───────┘
└──────────────┘                          │
                                          ▼
                                   ┌──────────────┐
                                   │ Normalize +  │
                                   │ upsert jobs  │
                                   └──────┬───────┘
                                          │
                                          ▼
                                   ┌──────────────┐
                                   │ Matching     │
                                   │ worker       │
                                   └──────┬───────┘
                                          │
                                          ▼
                                   ┌──────────────┐
                                   │ Notification │
                                   │ worker       │
                                   └──────────────┘
```

### WHY separate workers

- Retries with backoff per source
- Isolation from user-facing latency
- Horizontal scale by queue depth

**Rejected:** Single cron SQL job — no structured error handling or multi-source orchestration.

---

## Communication with other subsystems

| Subsystem | Interface |
|-----------|-----------|
| [database.md](./database.md) | Service role for workers; user JWT for API |
| [ingestion.md](./ingestion.md) | Worker pulls from sources → writes `jobs` |
| [matching.md](./matching.md) | Worker reads jobs + users → writes `matches` |
| [notifications.md](./notifications.md) | Worker reads pending notifications → FCM |
| [frontend.md](./frontend.md) | Clients call API routes |

---

## Design principles

1. **Idempotency keys** on ingestion and payment webhooks
2. **Structured logging** (JSON) with `request_id`, `user_id`, `job_id`
3. **Fail closed** on auth — 401/403, never silent empty success
4. **Secrets only server-side** — service role never in client

---

## Assumptions

- Serverless-first; no long-lived Node processes until queue volume requires it
- UTC timestamps everywhere in DB

---

## Future expansion

- Redis / SQS queue between ingestion and matching
- Dedicated matching microservice if CPU-bound
- OpenTelemetry tracing across API and workers

---

## Known limitations

- ~~Prototype has no API layer~~ — API routes implemented (Phase 1)
- No distributed tracing yet

---

## Common mistakes

| Mistake | Risk |
|---------|------|
| Exposing service role to Next.js client bundle | Full DB access |
| Running matching in API request | Timeouts, O(n) per request |
| Skipping idempotency on ingestion | Duplicate jobs |

---

## Related documents

- [api.md](./api.md)
- [ingestion.md](./ingestion.md)
- [deployment.md](./deployment.md)
- [security.md](./security.md)
