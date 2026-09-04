# Kazana

**AI Hiring Intelligence Platform.**

The **assessment engine** is the product. Jobs, resumes, AI interview practice, and (later) enterprise screening exist to generate value and **learning signals** that make assessments better over time.

We are not a job board, ATS, interview-question repository, or recruiter CRM.

> **Does this strengthen the assessment engine or one of its learning loops?**  
> If not, it may not belong in Kazana.

Full manifesto: [docs/vision.md](./docs/vision.md).

## Quick start (web)

```bash
npm install
cp .env.example .env   # fill in Supabase keys
npm run dev            # http://localhost:3000
```

### Environment

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server uploads, workers, cron, credit RPCs |
| `CRON_SECRET` | Protects `/api/cron/*` on Vercel |
| `DEEPSEEK_API_KEY` | Optional LLM escalation for job extraction |
| `DEEPSEEK_MODEL` | Default `deepseek-v4-flash` |
| `SENTRY_DSN` | Optional error tracking |

Testing (integration, optional): `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, `TEST_SUPABASE_SERVICE_ROLE_KEY` — see [docs/credits.md](./docs/credits.md#testing).

## Database setup

Run migrations in Supabase SQL Editor (see `db/migrations/`), or list pending with:

```bash
npm run db:migrate
```

## Workers

```bash
npm run ingest                 # job ingestion + extraction
npm run extract:reprocess      # re-run extraction on stored jobs
npm run match                  # matching → matches + notification_queue
npm run notify                 # Expo push for pending notifications
npm test                       # unit tests (vitest)
npm run test:integration       # credit-integrity tests against a dedicated test Supabase
```

**Vercel cron** (see `vercel.json`): match hourly, notify on schedule, credit reconciliation (expiry + stale reservations + monthly grants) on the half-hour.

## Product surfaces (today)

| Route | Role in the flywheel |
|-------|----------------------|
| `/discover` | Resume Vault — peer signal |
| `/jobs` | Jobs — acquisition / retention |
| `/matches` | Personalized jobs — engagement |
| `/settings` | Preferences |

Strategy and phases: [docs/product.md](./docs/product.md), [docs/roadmap.md](./docs/roadmap.md).

## Mobile (Expo)

```bash
cd apps/mobile && npm install
# set EXPO_PUBLIC_* — see apps/mobile/README.md
npm start
```

## Documentation

| Doc | Content |
|-----|---------|
| [docs/vision.md](./docs/vision.md) | Identity, flywheel, moat, principles |
| [docs/product.md](./docs/product.md) | Product strategy |
| [docs/roadmap.md](./docs/roadmap.md) | Phases 1–5 |
| [docs/architecture.md](./docs/architecture.md) | Systems for learning |
| [docs/credits.md](./docs/credits.md) | AI Credits & Entitlements |
| [docs/README.md](./docs/README.md) | Full doc index |

## Legacy

Vite prototype archived in `_legacy/vite-src/`.
