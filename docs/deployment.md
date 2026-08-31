# Deployment

## Purpose

Defines environments, hosting, CI/CD, secrets, and operational runbooks for Kazana.

---

## Environments

| Environment | Purpose | Supabase | Web hosting |
|-------------|---------|----------|-------------|
| **Local** | Development | Dev project or local | `npm run dev` (Vite / Next) |
| **Staging** | Pre-prod QA | Staging project | Vercel preview |
| **Production** | Live users | Prod project | Vercel production |

**Rule:** Production credentials MUST NOT exist on developer laptops except via scoped CLI tokens.

---

## Deployment topology (target)

```
┌─────────────────────────────────────────────────────────┐
│ GitHub                                                  │
│   main branch ──► CI ──► Vercel (Next.js web + API)     │
│   tags ─────────► EAS Build (mobile)                    │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│ Supabase Prod   │     │ Cron / Workers  │
│ • Postgres      │     │ (Vercel cron or │
│ • Auth          │     │  separate host) │
│ • Storage       │     └─────────────────┘
│ • Edge Fn       │
└─────────────────┘
```

---

## Current prototype deployment

| Component | How |
|-----------|-----|
| Web | Vite build → static assets on Vercel (or similar) |
| Backend | None (client → Supabase) |
| DB | Supabase hosted |

**Env vars (client):**

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_KEY` (anon key only)

---

## CI/CD pipeline (target)

| Stage | Checks |
|-------|--------|
| PR | Lint, typecheck, unit tests, build |
| Merge to `main` | Deploy staging |
| Release tag | Deploy production + EAS mobile |
| DB migration | Manual approval or automated on staging first |

---

## Secrets management

| Secret | Where | MUST NOT |
|--------|-------|----------|
| Supabase anon key | Client env (Vercel) | N/A — public by design |
| Supabase service role | Server/workers only | Client bundle |
| Google OAuth client secret | Supabase Auth config | Repo |
| Stripe webhook secret | Edge function env | Client |
| FCM server key | Worker env | Client |

---

## Supabase Auth URLs (local dev)

For Google OAuth on localhost:

| Setting | Value |
|---------|-------|
| Site URL | `http://localhost:5173` (or Next port) |
| Redirect URLs | `http://localhost:5173/**` |

See [TROUBLESHOOTING.md](../TROUBLESHOOTING.md) for common OAuth issues.

---

## Monitoring (target)

| Signal | Tool |
|--------|------|
| API errors / latency | Vercel Analytics / Sentry |
| DB performance | Supabase dashboard |
| Ingestion success | Custom metrics table + alert |
| Push delivery | FCM/OneSignal dashboards |

---

## Rollback strategy

| Layer | Rollback |
|-------|----------|
| Web/API | Vercel instant rollback to previous deployment |
| DB | Forward-only migrations; write down migration for emergencies |
| Mobile | Previous app version in stores; API backward compatible |

---

## Communication with other subsystems

All subsystems deploy independently but share **schema version** — coordinate DB migrations before API changes that depend on new columns.

---

## Assumptions

- Vercel for Next.js is acceptable vendor lock-in for web tier
- Single Supabase region initially (e.g. US East)

---

## Future expansion

- Blue/green for workers
- Multi-region Supabase
- CDN in front of storage bucket for PDFs

---

## Known limitations

- No formal staging environment documented in prototype repo
- Manual SQL migrations today

---

## Common mistakes

| Mistake | Consequence |
|---------|-------------|
| Deploy prod without running RLS policies | Empty app / security hole |
| Same Supabase project for dev and prod | Data corruption |
| Commit `.env` | Credential leak |

---

## Related documents

- [security.md](./security.md)
- [database.md](./database.md)
- [contributing.md](./contributing.md)
