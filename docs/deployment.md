# Deployment

## Purpose

Defines environments, hosting, CI/CD, secrets, and operational runbooks for Kazana.

---

## Environments

| Environment | Purpose | Supabase | Web hosting |
|-------------|---------|----------|-------------|
| **Local** | Development | Dev project or local | `npm run dev` (Next) |
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
┌─────────────────┐     ┌──────────────────────────────┐
│ Supabase Prod   │     │ Workers (container host)     │
│ • Postgres      │     │ • pulse: match→notify / 5 min│
│ • Auth          │     │ • ingest: continuous sweep   │
│ • Storage       │     └──────────────────────────────┘
│ • Edge Fn       │        (Vercel cron = hourly fallback)
└─────────────────┘
```

---

## Current deployment

| Component | How |
|-----------|-----|
| Web + API | Next.js on Vercel (`npm run build` → `next start`) |
| Worker — pulse | Container host running `npm run worker:pulse` — match every user, then drain the queue every 5 minutes |
| Worker — ingest | Same image, `node scripts/worker/ingest.js` — continuous source sweeps |
| DB | Supabase hosted. `npm run db:migrate` with `DATABASE_URL` (direct connection) applies pending files and records them in `public.schema_migrations` |
| Mobile | EAS Build (Expo) |

`vercel.json` still schedules `/api/cron/match` (hourly, `:00`), `/api/cron/notify`
(hourly, `:05`) and `/api/cron/credits` (hourly, `:15`) as a web-only fallback.
They are safe to keep alongside the worker: matching upserts are idempotent and
the dispatcher atomically claims rows, so a row can never be sent twice. Remove
them if you want a single scheduler.

### GitHub Actions worker scheduler (5-minute cadence, zero infra)

`.github/workflows/ingest-pulse.yml` runs both workers every 5 minutes as **two
parallel jobs**, so a slow ingest never delays the delivery pulse:

| Job | Command | Timeout |
|-----|---------|---------|
| ingest | `node scripts/worker/ingest.js --once` | 45 min |
| pulse | `node scripts/worker/pulse.js --once` | 10 min |

Both are guarded by a leased DB lock (`public.worker_locks`, migration
`20261111000000_worker_locks.sql`). If a previous run is still in flight, the
next tick logs `skipped — previous run still in progress` and exits 0, so runs
never overlap and a job is never sent twice. A heartbeat extends the lease while
the run is alive; a crashed run expires automatically (ingest lease 15 min,
pulse lease 5 min).

The ingest is incremental (`jobs` are fetched only since each source's
`last_fetched_at`), so a warm pass takes minutes — not the ~80 min a cold,
months-long sweep takes. `last_fetched_at` is written per source, so a job that
is killed part-way simply resumes on the next tick.

**Why not Vercel cron for ingest:** a Vercel function is capped at 60 s (Hobby) /
300 s (Pro), and Vercel cron's minimum interval is daily on Hobby. GitHub
Actions jobs run up to 6 h, are free for public repositories, and support a
5-minute cron.

**Repository secrets:** `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`),
`SUPABASE_SERVICE_ROLE_KEY`; optional `DEEPSEEK_API_KEY`,
`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`.

**Repository variables (optional):** `DEEPSEEK_MODEL`,
`WORKER_INGEST_CONCURRENCY`, `WORKER_MATCH_LOOKBACK_HOURS`,
`WORKER_NOTIFY_LIMIT`, `WHATSAPP_JOB_MATCH_TEMPLATE`.

**Before the first scheduled run:** apply the migration
(`DATABASE_URL=… npm run db:migrate` or paste it into the Supabase SQL Editor).
Until it is applied the lock helper fails open (logs a warning and runs without
the guard) — so the workers still function, just without skip-if-running.


**Env vars (client):**

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (anon key only)

**Env vars (server only):** `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, and the notification credentials below. Full reference: [.env.example](../.env.example).

---

## Why the workers are not Vercel Functions

The web tier is a request/response app; both loops are long-running jobs.

- Ingestion sweeps **every active `job_sources` row** — currently **114 sources**.
  Measured from `ingestion_runs` (129 runs over the last 36 h): **median ~96 s per
  source, p90 ~12 min, max ~1.8 h** (large boards such as `gh-spacex`, and
  Workday sources that paginate slowly). One sequential pass is therefore
  **hours**, far beyond the 60 s (Hobby) / 300 s (Pro) function limit, and Vercel
  Cron on Hobby cannot run sub-daily at all.
- Matching is CPU-bound and grows with `users × jobs`; keeping it off the web
  tier protects request latency.
- The ingest CLI writes `logs/ingest-metrics/*.json`. Container filesystems are
  ephemeral — mount a volume if you need those files, or read `ingestion_runs`
  in Postgres instead.

The **5-minute requirement belongs to the pulse**, not to a full ingest pass:

```
ingest sweep (continuous, bounded concurrency)
      │  jobs.discovered_at
      ▼
pulse every 5 min → runMatching(all users) → notification_queue
      │
      ▼
runNotifications → Expo push / WhatsApp Cloud API → sent_at
```

A newly ingested job is scored, enqueued and dispatched within one pulse
(≤ 5 min). **Source freshness is a different budget** and cannot be 5 minutes
for all 114 sources from one process:
`pass_minutes ≈ Σ per-source seconds ÷ concurrency`. The measured source work
per pass is ~630 min, so at concurrency 8 a pass is **~80 min**, and ~40 min at
the code's cap of 16. Each source is refreshed **once per pass (~40–80 min)**;
alert latency is still ≤ 5 min *after* that refresh.

To push freshness closer to the pulse cadence (not implemented yet):

- Raise `WORKER_INGEST_CONCURRENCY` (16 is the hard cap in `runIngestion`).
- Shard `job_sources` across several replicas, each with its own loop.
- Timebox pathological sources (`wd-*`, multi-thousand-job `gh-*` boards): a
  single 70-minute run currently holds one slot for the whole pass.

---

## Deploy the web tier (Vercel)

1. Apply migrations against the production Supabase project:
   `DATABASE_URL=... npm run db:migrate && npm run db:status`.
2. Import the repository into Vercel. Framework preset **Next.js**, root
   directory `./`, build command `npm run build`.
3. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, and `SENTRY_DSN` (optional).
4. Deploy, then verify `/api/jobs` returns 200 and Google sign-in completes.
5. Cron plan limits: Hobby cron jobs may run **once per day** and sub-daily
   expressions **fail the deployment**. On Hobby, delete the `crons` array from
   `vercel.json` and let the worker pulse own matching and delivery. On Pro the
   hourly schedules work; Vercel invokes them with `GET` and sends
   `CRON_SECRET` as a bearer token (the routes export both `POST` and `GET`).

---

## Deploy the worker tier (container host)

Any container host works (Railway, Fly.io, Render, ECS, or a VPS with
`docker run --restart unless-stopped`). The image runs the CLI scripts; the web
tier is unaffected.

```bash
docker build -t kazana-worker .
```

Run **two services from the same image**, one replica each:

| Service | Command | Purpose |
|---------|---------|---------|
| `kazana-pulse` | `node scripts/worker/pulse.js` (image default) | match → notify every 5 min |
| `kazana-ingest` | `node scripts/worker/ingest.js` | continuous source sweeps |

Worker env (server only):

| Variable | Required | Notes |
|----------|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`) | yes | same project as the web tier |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | never expose to the browser |
| `DEEPSEEK_API_KEY` | for LLM extraction | falls back to rule-based extraction when unset |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | for WhatsApp | see below |
| `WHATSAPP_JOB_MATCH_TEMPLATE`, `WHATSAPP_TEMPLATE_LANGUAGE` | optional | default `job_match_alert` / `en` |
| `WORKER_PULSE_MINUTES` | optional | default `5` |
| `WORKER_MATCH_LOOKBACK_HOURS` | optional | default `2` — covers a missed pulse; keep the window × hourly job volume under the 2,000-candidate cap |
| `WORKER_NOTIFY_LIMIT` | optional | default `200` rows per pulse |
| `WORKER_INGEST_CONCURRENCY` | optional | default `8`, capped at `16`; raise for fresher per-source data |
| `WORKER_INGEST_COOLDOWN_MINUTES` | optional | default `5` pause between passes |

Both loops run **sequentially** — a slow pass delays the next one but never
overlaps it. Because of that, run exactly **one replica per service**; two ingest
replicas would poll the same boards twice. Each loop catches its own errors and
keeps running, so a Supabase or provider outage shows up as failed pulses in the
logs, not as a dead process.

`--once` runs one pass and exits (exit code `1` if any stage failed), for hosts
that prefer an external scheduler:

```bash
node scripts/worker/pulse.js --once
```

---

## Activate WhatsApp (Meta Cloud API)

Automated WhatsApp delivery needs a Meta-side setup that cannot be done from
this repo:

1. **Business portfolio + verification** in Meta Business Manager. Cloud API
   requires a business account; verification can take days.
2. **App + WhatsApp product**: create a Business-type app, add WhatsApp, and
   attach a WhatsApp Business Account (WABA).
3. **Phone number**: add a number that is not active in the consumer WhatsApp
   app (delete/migrate it first). Copy its **Phone number ID**.
4. **Template** named `job_match_alert` (or set `WHATSAPP_JOB_MATCH_TEMPLATE`),
   language `en`, category **Utility** (Meta may reclassify it as **Marketing** —
   pricing and opt-in rules follow the approved category), with three body
   variables in this order:
   `New job match: {{1}} at {{2}} — {{3}}% match`
   (`{{1}}` job title, `{{2}}` company, `{{3}}` rounded match score).
   Wait for status **Approved**.
5. **Permanent token**: create a System User with `whatsapp_business_messaging`
   and `whatsapp_business_management`, then generate a token that does not
   expire. Temporary 24 h tokens will break the worker overnight.
6. Set `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` on the **pulse**
   service and restart it.

Delivery then requires a user opt-in: `notification_preferences.whatsapp_enabled = true`
and a valid E.164 `whatsapp_phone`. Defaults: minimum match score `0.7`
(`WHATSAPP_MIN_MATCH_SCORE`), 3 messages/day (`WHATSAPP_DAILY_LIMIT`), and quiet
hours are respected.

Until the credentials are set, WhatsApp queue rows stay `pending` and are
deferred with `last_error = whatsapp_not_configured`; they drain automatically
once the env vars are present. `npm run notify:manual` lists those same rows as
`wa.me` links for hand-sending from the WhatsApp Business app in the meantime.

---

## Verify the pipeline end to end

1. **Workers alive**: logs show `[worker] pulse starting` and a
   `[worker] match` / `[worker] notify` pair every 5 minutes.
2. **Ingestion**: `ingestion_runs` has recent `success` rows; the ingest log
   reports `jobs_upserted > 0` when boards change.
3. **Matching**: `matches` gains rows for the new jobs. `runMatching` returns
   `{ matched, enqueued, jobs, users }` in the pulse log.
4. **Queue**: a `notification_queue` row moves `pending → processing → sent`
   with `provider_message_id` starting `wamid.` and `sent_at` set;
   `matches.notified_at` is stamped for that match.
5. **Template failures** land in `last_error` (4xx errors are permanent and are
   not retried). Common causes: template not approved, wrong language, empty
   parameter (we send fallbacks), number not in E.164, or recipient opted out.

---

## Operating notes

- **One replica per loop.** `claim()` protects against double-sends, but a
  second ingest replica doubles provider traffic.
- **Backlogs** drain at `WORKER_NOTIFY_LIMIT` rows per pulse; the pulse log
  reports `deferred` separately from `failed`.
- **Candidate cap**: `runMatching` scores at most 2,000 jobs per global run,
  newest `discovered_at` first. The 2-hour pulse window stays below that at the
  observed ~530 new jobs/hour; a 24-hour lookback would silently skip jobs.
- **Quiet hours** currently mark a row `skipped` rather than rescheduling it, so
  alerts enqueued inside a user's quiet window are dropped. Fixing this means
  deferring to the window end (follow-up).
- **Inbound replies / STOP** are not handled yet — there is no WhatsApp webhook.
  Until it exists, honour opt-out requests manually by setting
  `whatsapp_enabled = false`.
- **Secrets**: the worker needs `SUPABASE_SERVICE_ROLE_KEY` and the WhatsApp
  token; only the web tier needs the public Supabase keys. Never put either in
  the client bundle.

---

## CI/CD pipeline (target)

| Stage | Checks |
|-------|--------|
| PR | Lint + build (`.github/workflows/ci.yml`). Unit tests are **not** run in CI yet — run `npm run test:unit` locally |
| Merge to `main` | Deploy staging; build and push the worker image |
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
| FCM server key (via Expo) | Worker env | Client |
| WhatsApp Cloud API access token + phone-number id | Server env only | Client bundle / repo |
| `WHATSAPP_JOB_MATCH_TEMPLATE` | Server env — MUST match an approved Meta template name | Client |

---

## Notification channels

| Channel | Provider | Activation |
|---------|----------|------------|
| `push` | Expo Push Service (FCM/APNs underneath) | Always on; requires a registered `device_tokens` row |
| `whatsapp` | Meta WhatsApp Cloud API | **Dormant until configured** — set `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` and an approved `job_match_alert` template |

When WhatsApp credentials are absent the channel does **not** fail: its queue rows
stay `pending`, so setting the env vars later drains the backlog with no migration
or backfill. Inspect a user's delivery log — `status`, `failure_reason`,
`provider_message_id` — via `GET /api/notifications`.

Mechanics: [notifications.md](./notifications.md) · decision: [ADR-020](./decisions.md#adr-020-multi-channel-notifications-behind-a-provider-registry).

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
| Worker liveness | Container restart policy + alert on `[worker] *_failed` log lines |
| Push delivery | Expo dashboards |
| Notification delivery | `GET /api/notifications` per-user log; Meta WhatsApp Manager for template status |

---

## Rollback strategy

| Layer | Rollback |
|-------|----------|
| Web/API | Vercel instant rollback to previous deployment |
| Workers | Redeploy the previous image tag; both loops are idempotent (upserts + atomic queue claims) |
| DB | Forward-only migrations; write down migration for emergencies |
| Mobile | Previous app version in stores; API backward compatible |

---

## Communication with other subsystems

All subsystems deploy independently but share **schema version** — coordinate DB migrations before API changes that depend on new columns.

---

## Assumptions

- Vercel for Next.js is acceptable vendor lock-in for web tier
- One container replica per worker loop (pulse, ingest)
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
