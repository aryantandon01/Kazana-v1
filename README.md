# Kazana

**AI Hiring Intelligence Platform.**

The **assessment engine** is the long-term product and moat. Phase 1 is the **candidate platform** — Jobs, resumes / Resume Optimization, and interview-experience sharing — which generates value and **learning signals**. AI Interview Practice and (later) enterprise screening are deferred to Phase 2.

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
| `SUPABASE_SERVICE_ROLE_KEY` | Server uploads, workers, cron |
| `CRON_SECRET` | Protects `/api/cron/*` on Vercel |
| `DEEPSEEK_API_KEY` | Optional LLM escalation for job extraction |
| `DEEPSEEK_MODEL` | Default `deepseek-v4-flash` |
| `SENTRY_DSN` | Optional error tracking |

## Database setup

Apply migrations over a direct Postgres connection (`DATABASE_URL` in `.env`):

```bash
npm run db:status    # ledger + live schema: what is actually applied
npm run db:diff      # which objects a partially-applied file is missing
npm run db:migrate   # apply pending files and backfill the ledger
```

Without `DATABASE_URL` the scripts fall back to listing unrecorded files. Migrations can also be pasted into the Supabase SQL Editor — they are written to be idempotent.

## Workers

```bash
npm run ingest                 # job ingestion + extraction
npm run extract:reprocess      # re-run extraction on stored jobs
npm run match                  # matching → matches + notification_queue
npm run notify                 # drain the queue → push and/or WhatsApp (per channel)
```

**Vercel cron** (see `vercel.json`): match hourly at `:00`, notify hourly at `:05`. Both are also runnable as scripts (`npm run match`, `npm run notify`).

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
| [docs/README.md](./docs/README.md) | Full doc index |

## Legacy

Vite prototype archived in `_legacy/vite-src/`.
